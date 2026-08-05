import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupModelPicker } from "./app-model-picker.js";

function loadBody() {
  const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
  const parsed = new JSDOM(html);
  document.body.innerHTML = parsed.window.document.body.innerHTML;
}

const models = [
  { id: "claude-sonnet-4-5-20250929", provider: "anthropic", contextWindow: 200000 },
  { id: "glm-4.6", provider: "zai", contextWindow: 128000 },
];

function installModelInfoFetch() {
  const fetch = vi.fn((_url, options) => {
    const request = JSON.parse(options.body);
    if (request.type === "get_available_models") {
      return Promise.resolve({
        json: async () => ({ success: true, data: { models } }),
      });
    }
    if (request.type === "get_state") {
      return Promise.resolve({
        json: async () => ({
          success: true,
          data: {
            model: { id: "claude-sonnet-4-5-20250929", provider: "anthropic" },
            thinkingLevel: "off",
          },
        }),
      });
    }
    throw new Error(`Unexpected RPC: ${request.type}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function setupPicker(rpcCommand) {
  loadBody();
  return setupModelPicker({
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
}

async function renderModelRows(rpcCommand) {
  const picker = setupPicker(rpcCommand);
  await picker.fetchModelInfo();
  document.querySelector("#model-dropdown-btn").click();
  const row = [...document.querySelectorAll(".model-dropdown-item")].find((item) =>
    item.textContent.includes("glm-4.6"),
  );
  expect(row).not.toBeUndefined();
  return row;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model picker switching", () => {
  test("shows switching feedback, passes the timeout, and adopts a successful model", async () => {
    installModelInfoFetch();
    let labelAtRpc;
    const rpcCommand = vi.fn(() => {
      labelAtRpc = document.querySelector("#model-dropdown-label").textContent;
      return Promise.resolve({ success: true });
    });
    const row = await renderModelRows(rpcCommand);

    row.click();

    expect(labelAtRpc).toBe("Switching to glm-4.6…");
    expect(rpcCommand).toHaveBeenCalledWith(
      { type: "set_model", provider: "zai", modelId: "glm-4.6" },
      "Switching to glm-4.6...",
      { timeoutMs: 12000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("#model-dropdown-label").textContent).toBe("glm-4.6");
  });

  test("restores the previous model label when switching fails", async () => {
    installModelInfoFetch();
    const rpcCommand = vi.fn().mockResolvedValue({ success: false, error: "nope" });
    const row = await renderModelRows(rpcCommand);

    row.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector("#model-dropdown-label").textContent).toBe("sonnet-4-5");
    expect(document.querySelector("#model-dropdown-label").textContent).not.toBe("glm-4.6");
  });

  test("ignores a second model click while the first switch is pending", async () => {
    installModelInfoFetch();
    let resolveRpc;
    const rpcCommand = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve;
        }),
    );
    const row = await renderModelRows(rpcCommand);

    row.click();
    row.click();

    expect(rpcCommand).toHaveBeenCalledTimes(1);
    resolveRpc({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
