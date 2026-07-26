import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { setupComposer } from "./app-composer.js";
import { setupModelPicker } from "./app-model-picker.js";
import { setupSlashMenu } from "./app-slash-menu.js";

// Batch B self-check: thinking dropdown (B1), plan toggle (B2), slash menu (B3).
// The modules under test grab elements via the bare global `document`, so the
// real index.html body is loaded into vitest's jsdom global document.

function loadBody() {
  const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
  const parsed = new JSDOM(html);
  document.body.innerHTML = parsed.window.document.body.innerHTML;
}

describe("slash-command autocomplete (B3)", () => {
  test("filters by prefix, Enter inserts without sending, Escape closes", () => {
    loadBody();
    const messageInput = document.querySelector("#message-input");
    setupSlashMenu({ messageInput });

    // Stand-in for the composer's bubbling Enter-to-send listener.
    const composerEnter = vi.fn();
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) composerEnter();
    });

    const menu = document.querySelector(".slash-menu");
    expect(menu.classList.contains("hidden")).toBe(true);

    messageInput.value = "/pl";
    messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(menu.classList.contains("hidden")).toBe(false);
    expect(menu.textContent).toContain("/plan");

    // Enter picks the highlighted command: inserts "/plan ", sends nothing.
    messageInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(messageInput.value).toBe("/plan ");
    expect(composerEnter).not.toHaveBeenCalled();
    expect(menu.classList.contains("hidden")).toBe(true);

    // Reopen, Escape closes without touching the value or sending.
    messageInput.value = "/pl";
    messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(menu.classList.contains("hidden")).toBe(false);
    messageInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(menu.classList.contains("hidden")).toBe(true);
    expect(messageInput.value).toBe("/pl");

    // Menu closed: Enter reaches the composer's listener untouched.
    messageInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(composerEnter).toHaveBeenCalledTimes(1);
  });
});

describe("thinking-level dropdown (B1)", () => {
  test("lists all 7 levels with current highlighted, picks via set_thinking_level", async () => {
    loadBody();
    const rpcCommand = vi.fn().mockResolvedValue({ success: true });
    setupModelPicker({
      settingsPanel: document.querySelector("#settings-panel"),
      composerCard: document.querySelector("#composer-card"),
      messageInput: document.querySelector("#message-input"),
      rpcCommand,
      updateUI: () => {},
      updateTokenUsage: () => {},
      setContextWindowSize: () => {},
      hasAnySessionsLoaded: () => true,
      getCurrentWorkspacePath: () => "/tmp",
      openConfigurationSettings: async () => {},
    });

    const btn = document.querySelector("#thinking-btn");
    const menuEl = document.querySelector("#thinking-dropdown-menu");
    expect(menuEl.classList.contains("hidden")).toBe(true);

    btn.click();
    expect(menuEl.classList.contains("hidden")).toBe(false);
    const items = [...menuEl.querySelectorAll(".thinking-dropdown-item")];
    expect(items.map((i) => i.textContent)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(items[0].classList.contains("active")).toBe(true);

    items.find((i) => i.textContent === "high").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(rpcCommand).toHaveBeenCalledWith(
      { type: "set_thinking_level", level: "high" },
      "Setting thinking...",
    );
    expect(document.querySelector("#thinking-dropdown-label").textContent).toBe("Think high");
    expect(menuEl.classList.contains("hidden")).toBe(true);

    // Outside click closes an open dropdown.
    btn.click();
    expect(menuEl.classList.contains("hidden")).toBe(false);
    document.body.click();
    expect(menuEl.classList.contains("hidden")).toBe(true);
  });
});

describe("plan-mode toggle (B2)", () => {
  function composerDeps(rpcCommand) {
    return {
      transport: null,
      state: { isStreaming: false },
      wsClient: { send: vi.fn(() => "req-1") },
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
      rpcCommand,
    };
  }

  test("click sends set_plan_mode RPC and flips only on the response", async () => {
    loadBody();
    const rpcCommand = vi.fn().mockResolvedValue({ success: true, data: { enabled: true } });
    const { syncPlanMode } = setupComposer(composerDeps(rpcCommand));

    const btn = document.querySelector("#plan-toggle-btn");
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    btn.click();
    expect(rpcCommand).toHaveBeenCalledWith({ type: "set_plan_mode", enabled: true });
    // No optimistic flip before the response lands.
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    await new Promise((r) => setTimeout(r, 0));
    expect(btn.classList.contains("active")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    // Startup sync applies the real state from get_plan_mode.
    rpcCommand.mockResolvedValueOnce({ success: true, data: { enabled: false } });
    await syncPlanMode();
    expect(rpcCommand).toHaveBeenLastCalledWith({ type: "get_plan_mode" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("does not flip when the RPC fails, then second click sends enabled:false", async () => {
    loadBody();
    const rpcCommand = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: "nope" })
      .mockResolvedValueOnce({ success: true, data: { enabled: true } })
      .mockResolvedValueOnce({ success: true, data: { enabled: false } });
    setupComposer(composerDeps(rpcCommand));

    const btn = document.querySelector("#plan-toggle-btn");

    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.classList.contains("active")).toBe(false);

    // First click failed → still off → next click asks to enable again.
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(rpcCommand).toHaveBeenNthCalledWith(2, { type: "set_plan_mode", enabled: true });
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    // Now on → next click asks to disable.
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(rpcCommand).toHaveBeenNthCalledWith(3, { type: "set_plan_mode", enabled: false });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("does not send while a turn is streaming or without an active session", () => {
    loadBody();
    const rpcCommand = vi.fn().mockResolvedValue({ success: true, data: { enabled: true } });
    const deps = composerDeps(rpcCommand);
    deps.state = { isStreaming: true };
    setupComposer(deps);
    document.querySelector("#plan-toggle-btn").click();
    expect(rpcCommand).not.toHaveBeenCalled();

    loadBody();
    setupComposer({
      ...deps,
      state: { isStreaming: false },
      currentOnboardingState: () => ({ canQuery: false }),
      messageInput: document.querySelector("#message-input"),
      composerCard: document.querySelector("#composer-card"),
      chatForm: document.querySelector("#chat-form"),
      abortBtn: document.querySelector("#abort-btn"),
    });
    document.querySelector("#plan-toggle-btn").click();
    expect(rpcCommand).not.toHaveBeenCalled();
  });
});
