import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupCommandPalette } from "./app-command-palette.js";

function loadBody() {
  const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
  const parsed = new JSDOM(html);
  document.body.innerHTML = parsed.window.document.body.innerHTML;
}

function setupPalette(streaming) {
  loadBody();
  const statusText = document.querySelector("#status-text");
  const updateUI = vi.fn(() => {
    statusText.textContent = streaming() ? "Working..." : "Connected";
  });
  const { rpcCommand } = setupCommandPalette({
    statusText,
    updateUI,
    messageRenderer: { renderSystemMessage: vi.fn() },
    toolCardRenderer: { expandAll: vi.fn(), collapseAll: vi.fn() },
  });
  return { rpcCommand, statusText, updateUI };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("command palette status ownership", () => {
  test("keeps a streaming turn labeled Working after a successful command", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }));
    const streaming = true;
    const { rpcCommand, statusText } = setupPalette(() => streaming);

    await rpcCommand({ type: "compact" }, "Compacting...");

    expect(statusText.textContent).toBe("Done");
    vi.advanceTimersByTime(2000);
    expect(statusText.textContent).toBe("Working...");
  });

  test("delegates the successful idle reset to updateUI", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }));
    const { rpcCommand, statusText } = setupPalette(() => false);

    await rpcCommand({ type: "compact" }, "Compacting...");

    expect(statusText.textContent).toBe("Done");
    vi.advanceTimersByTime(2000);
    expect(statusText.textContent).toBe("Connected");
  });

  test("restores the streaming status after an RPC error response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ success: false, error: "boom" }) }),
    );
    const { rpcCommand, statusText } = setupPalette(() => true);

    await rpcCommand({ type: "compact" }, "Compacting...");

    expect(statusText.textContent).toBe("boom");
    vi.advanceTimersByTime(3000);
    expect(statusText.textContent).toBe("Working...");
  });

  test("restores the streaming status and resolves undefined after fetch rejection", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { rpcCommand, statusText } = setupPalette(() => true);

    const result = await rpcCommand({ type: "compact" }, "Compacting...");

    expect(result).toBeUndefined();
    expect(statusText.textContent).toBe("Error");
    vi.advanceTimersByTime(3000);
    expect(statusText.textContent).toBe("Working...");
  });
});
