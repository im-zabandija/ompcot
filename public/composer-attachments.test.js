import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupComposer } from "./app-composer.js";
import { resolveExistingPaths } from "./file-browser.js";
import {
  composePromptText,
  parseFileUriList,
  pastedPathCandidates,
  splitPromptAttachments,
} from "./prompt-attachments.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Paso 1 del backlog P2: chips de adjunto en el composer.
// composePromptText es pura; el resto se ejercita montando el body real de
// index.html en el document global de jsdom, igual que app-slash-menu.test.js.

describe("composePromptText (pure)", () => {
  test("message + one path: path on its own line below a blank line", () => {
    expect(composePromptText("hola", ["/a/b.md"])).toBe("hola\n\n/a/b.md");
  });

  test("empty message + multiple paths: just the path list, no leading blank line", () => {
    expect(composePromptText("", ["/a/b.md", "/c"])).toBe("/a/b.md\n/c");
  });

  test("message + no paths: message unchanged, no trailing blank lines", () => {
    expect(composePromptText("hola", [])).toBe("hola");
  });
});

describe("splitPromptAttachments (pure)", () => {
  test("roundtrip: recupera texto y rutas de lo que arma composePromptText", () => {
    const wire = composePromptText("revisá esto", ["/a/b.md", "/c/d"]);
    expect(splitPromptAttachments(wire)).toEqual({
      text: "revisá esto",
      paths: ["/a/b.md", "/c/d"],
    });
  });

  test("mensaje que es sólo rutas: texto vacío", () => {
    expect(splitPromptAttachments("/a/b.md")).toEqual({ text: "", paths: ["/a/b.md"] });
  });

  test("prosa que termina en una ruta sin línea en blanco queda como texto", () => {
    const raw = "mirá esto\n/a/b.md";
    expect(splitPromptAttachments(raw)).toEqual({ text: raw, paths: [] });
  });

  test("un slash-command no es un adjunto", () => {
    expect(splitPromptAttachments("/help")).toEqual({ text: "/help", paths: [] });
  });

  test("una ruta con espacios cae a texto plano (techo conocido)", () => {
    const raw = "hola\n\n/home/x/My Docs/a.md";
    expect(splitPromptAttachments(raw)).toEqual({ text: raw, paths: [] });
  });
});

describe("parseFileUriList (pure)", () => {
  test("parses file URIs separated by CRLF", () => {
    expect(parseFileUriList("file:///tmp/one.txt\r\nfile:///tmp/two.md")).toEqual([
      "/tmp/one.txt",
      "/tmp/two.md",
    ]);
  });

  test("ignores RFC 2483 comments and non-file URIs", () => {
    expect(
      parseFileUriList("# copied files\nhttp://example.com/file.txt\nfile:///tmp/kept.txt"),
    ).toEqual(["/tmp/kept.txt"]);
  });

  test("decodes percent-escaped characters in paths", () => {
    expect(parseFileUriList("file:///tmp/My%20File.md")).toEqual(["/tmp/My File.md"]);
  });

  test("skips malformed URIs while retaining valid entries", () => {
    expect(parseFileUriList("file:///%E0%A4%A\nfile:///tmp/valid.txt")).toEqual(["/tmp/valid.txt"]);
  });

  test.each(["", null, undefined])("empty input %p returns no paths", (raw) => {
    expect(parseFileUriList(raw)).toEqual([]);
  });
});

describe("pastedPathCandidates (pure)", () => {
  test("returns two absolute paths separated by a newline", () => {
    expect(pastedPathCandidates("/tmp/one.txt\n/home/x/two.md")).toEqual([
      "/tmp/one.txt",
      "/home/x/two.md",
    ]);
  });

  test("accepts an absolute path containing spaces", () => {
    expect(pastedPathCandidates("/home/x/Mis Docs/a.md")).toEqual(["/home/x/Mis Docs/a.md"]);
  });

  test.each([
    ["mixed prose and a path", "revisá /tmp/file.txt", []],
    ["prose only", "hola mundo", []],
    ["empty or whitespace-only", " \n  ", []],
  ])("rejects %s", (_name, raw, expected) => {
    expect(pastedPathCandidates(raw)).toEqual(expected);
  });

  test("accepts an absolute Windows path", () => {
    const path = "C:\\Users\\x\\a.md";
    expect(pastedPathCandidates(path)).toEqual([path]);
  });
});

describe("resolveExistingPaths (fetch)", () => {
  function installFilesFetch(items) {
    const fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ items }),
      }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  test("groups paths in one directory into one fetch and keeps backend types", async () => {
    const fetch = installFilesFetch([
      { name: "one.txt", path: "/tmp/one.txt", isDirectory: false, size: 1, mtime: 1 },
      { name: "docs", path: "/tmp/docs", isDirectory: true, size: 0, mtime: 1 },
    ]);

    await expect(resolveExistingPaths(["/tmp/one.txt", "/tmp/docs"])).resolves.toEqual([
      { path: "/tmp/one.txt", isDirectory: false },
      { path: "/tmp/docs", isDirectory: true },
    ]);
    expect(fetch.mock.calls.length).toBe(1);
  });

  test("omits a path the backend does not list", async () => {
    installFilesFetch([
      { name: "present.txt", path: "/tmp/present.txt", isDirectory: false, size: 1, mtime: 1 },
    ]);

    await expect(resolveExistingPaths(["/tmp/missing.txt", "/tmp/present.txt"])).resolves.toEqual([
      { path: "/tmp/present.txt", isDirectory: false },
    ]);
  });

  test("returns existing paths in input order even when backend lists them reversed", async () => {
    installFilesFetch([
      { name: "second.txt", path: "/tmp/second.txt", isDirectory: false, size: 1, mtime: 1 },
      { name: "first.txt", path: "/tmp/first.txt", isDirectory: true, size: 0, mtime: 1 },
    ]);

    await expect(resolveExistingPaths(["/tmp/first.txt", "/tmp/second.txt"])).resolves.toEqual([
      { path: "/tmp/first.txt", isDirectory: true },
      { path: "/tmp/second.txt", isDirectory: false },
    ]);
  });

  test("returns no paths when the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(resolveExistingPaths(["/tmp/unavailable.txt"])).resolves.toEqual([]);
  });
});

describe("file chips (DOM)", () => {
  function loadBody() {
    const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
    const parsed = new JSDOM(html);
    document.body.innerHTML = parsed.window.document.body.innerHTML;
  }

  function composerDeps(wsSend) {
    return {
      transport: null,
      state: { isStreaming: false },
      wsClient: { send: wsSend ?? vi.fn(() => "req-1") },
      sidebar: { loadSessions: vi.fn().mockResolvedValue() },
      messageRenderer: { renderUserMessage: vi.fn() },
      messageInput: document.querySelector("#message-input"),
      composerCard: document.querySelector("#composer-card"),
      chatForm: document.querySelector("#chat-form"),
      abortBtn: document.querySelector("#abort-btn"),
      currentOnboardingState: () => ({ canQuery: true }),
      abortCurrentRun: vi.fn(),
      pollInstances: vi.fn().mockResolvedValue(),
      setLastSentMessage: vi.fn(),
      rpcCommand: vi.fn().mockResolvedValue({ success: true, data: { enabled: false } }),
    };
  }

  describe("pasting file URIs (DOM)", () => {
    function pasteEvent(data) {
      const event = new Event("paste", { cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { getData: (type) => data[type] ?? "", items: [] },
      });
      return event;
    }

    function stubFileLookup(items) {
      const fetch = vi.fn(() =>
        Promise.resolve({
          json: async () => ({ items }),
        }),
      );
      vi.stubGlobal("fetch", fetch);
      return fetch;
    }

    async function yieldToLookup() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    test("attaches two pasted files as chips and prevents the text paste", () => {
      loadBody();
      setupComposer(composerDeps());
      const event = pasteEvent({
        "text/uri-list": "file:///tmp/one.txt\nfile:///tmp/two.md",
      });

      document.querySelector("#message-input").dispatchEvent(event);

      expect(document.querySelectorAll("#file-chips .file-chip")).toHaveLength(2);
      expect(event.defaultPrevented).toBe(true);
    });

    test("leaves ordinary prose as an unhandled text paste", () => {
      loadBody();
      setupComposer(composerDeps());
      const event = pasteEvent({ "text/plain": "hola mundo" });

      document.querySelector("#message-input").dispatchEvent(event);

      expect(document.querySelectorAll("#file-chips .file-chip")).toHaveLength(0);
      expect(event.defaultPrevented).toBe(false);
    });

    test("attaches a bare path listed by the backend and clears the textarea", async () => {
      const path = "/tmp/copied.txt";
      stubFileLookup([{ name: "copied.txt", path, isDirectory: false, size: 1, mtime: 1 }]);
      loadBody();
      setupComposer(composerDeps());
      const input = document.querySelector("#message-input");
      const event = pasteEvent({ "text/plain": path });

      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await yieldToLookup();

      expect(document.querySelectorAll("#file-chips .file-chip")).toHaveLength(1);
      expect(document.querySelector(".file-chip-name").title).toBe(path);
      expect(input.value).toBe("");
    });

    test("falls back to inserting an unlisted bare path as text", async () => {
      const path = "/tmp/missing.txt";
      stubFileLookup([]);
      loadBody();
      setupComposer(composerDeps());
      const input = document.querySelector("#message-input");
      const event = pasteEvent({ "text/plain": path });

      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await yieldToLookup();

      expect(document.querySelectorAll("#file-chips .file-chip")).toHaveLength(0);
      expect(input.value).toBe(path);
    });

    test("uses backend isDirectory for a pasted path with an extension", async () => {
      const path = "/tmp/algo.txt";
      stubFileLookup([{ name: "algo.txt", path, isDirectory: true, size: 0, mtime: 1 }]);
      loadBody();
      setupComposer(composerDeps());
      const event = pasteEvent({ "text/plain": path });

      document.querySelector("#message-input").dispatchEvent(event);
      await yieldToLookup();

      expect(document.querySelector(".file-chip-icon").textContent).toBe("📁");
    });
  });

  test("addFilePaths renders one .file-chip per path", () => {
    loadBody();
    const { addFilePaths } = setupComposer(composerDeps());

    addFilePaths([{ path: "/a/b.md", isDirectory: false }]);

    const chips = document.querySelectorAll(".file-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].querySelector(".file-chip-name").textContent).toBe("b.md");
    expect(chips[0].querySelector(".file-chip-name").title).toBe("/a/b.md");
  });

  test("adding the same path twice dedupes to a single chip", () => {
    loadBody();
    const { addFilePaths } = setupComposer(composerDeps());

    addFilePaths([{ path: "/a/b.md", isDirectory: false }]);
    addFilePaths([{ path: "/a/b.md", isDirectory: false }]);

    expect(document.querySelectorAll(".file-chip")).toHaveLength(1);
  });

  test("clicking .file-chip-remove removes that chip", () => {
    loadBody();
    const { addFilePaths } = setupComposer(composerDeps());

    addFilePaths([
      { path: "/a/one.md", isDirectory: false },
      { path: "/a/two.md", isDirectory: false },
    ]);
    expect(document.querySelectorAll(".file-chip")).toHaveLength(2);

    document.querySelectorAll(".file-chip")[0].querySelector(".file-chip-remove").click();

    const remaining = document.querySelectorAll(".file-chip");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].querySelector(".file-chip-name").textContent).toBe("two.md");
  });

  test("sending includes the attached path in cmd.message and clears the chips", () => {
    loadBody();
    const wsSend = vi.fn(() => "req-1");
    const { addFilePaths } = setupComposer(composerDeps(wsSend));

    addFilePaths([{ path: "/a/b.md", isDirectory: false }]);
    document.querySelector("#message-input").value = "revisá esto";
    document
      .querySelector("#chat-form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(wsSend.mock.calls[0][0].message).toBe("revisá esto\n\n/a/b.md");
    expect(document.querySelectorAll(".file-chip")).toHaveLength(0);
  });

  test("renderFileChips never interpolates path/name markup into the DOM", () => {
    loadBody();
    const { addFilePaths } = setupComposer(composerDeps());

    addFilePaths([
      { path: "/tmp/<img src=x onerror=alert(1)>.md", isDirectory: false },
      { path: '/tmp/a" onmouseover="x.md', isDirectory: false },
    ]);

    const chips = document.querySelectorAll(".file-chip");
    expect(chips).toHaveLength(2);
    chips.forEach((chip) => {
      const nameEl = chip.querySelector(".file-chip-name");
      expect(nameEl.children).toHaveLength(0);
    });

    expect(chips[0].querySelector(".file-chip-name").textContent).toBe(
      "<img src=x onerror=alert(1)>.md",
    );
    expect(chips[0].querySelector(".file-chip-name").title).toBe(
      "/tmp/<img src=x onerror=alert(1)>.md",
    );
    expect(chips[1].querySelector(".file-chip-name").textContent).toBe('a" onmouseover="x.md');
    expect(chips[1].querySelector(".file-chip-name").title).toBe('/tmp/a" onmouseover="x.md');

    // Nunca se coló markup interpretado en el DOM real del chip.
    expect(document.querySelector(".file-chip img")).toBeNull();
  });
});
