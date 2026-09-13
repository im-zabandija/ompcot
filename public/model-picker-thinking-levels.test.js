import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupModelPicker, thinkingLevelsForModel } from "./app-model-picker.js";

function loadBody() {
  const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
  const parsed = new JSDOM(html);
  document.body.innerHTML = parsed.window.document.body.innerHTML;
}

// Mirrors a real catalog entry (Gemini 3 Pro-style): discrete,
// non-contiguous support that skips `medium`.
const gappedModel = {
  id: "gapped-model",
  provider: "google",
  contextWindow: 100000,
  thinking: { mode: "google-level", efforts: ["low", "high"] },
};

// Mirrors a non-anthropic model that still exposes `max` in its efforts
// (e.g. DeepSeek-style) — `max` must not be hidden just because `mode`
// isn't `anthropic-adaptive`.
const highMaxModel = {
  id: "high-max-model",
  provider: "deepseek",
  contextWindow: 128000,
  thinking: { mode: "effort", efforts: ["high", "max"] },
};

// Five-tier model with no `max` at all.
const fiveTierModel = {
  id: "five-tier-model",
  provider: "openai",
  contextWindow: 200000,
  thinking: { mode: "effort", efforts: ["minimal", "low", "medium", "high", "xhigh"] },
};

describe("thinkingLevelsForModel", () => {
  test("uses efforts as-is when the model declares gaps", () => {
    expect(thinkingLevelsForModel(gappedModel)).toEqual(["off", "low", "high"]);
  });

  test("offers max for a non-anthropic model whose efforts include it", () => {
    expect(thinkingLevelsForModel(highMaxModel)).toEqual(["off", "high", "max"]);
  });

  test("offers exactly the five declared tiers plus off when max is absent", () => {
    expect(thinkingLevelsForModel(fiveTierModel)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  test("tolerates a flat array as the thinking shape", () => {
    expect(
      thinkingLevelsForModel({ id: "flat", provider: "x", thinking: ["low", "high"] }),
    ).toEqual(["off", "low", "high"]);
  });

  test("falls back to the full canonical list for a model with no thinking metadata", () => {
    expect(thinkingLevelsForModel({ id: "no-metadata", provider: "x" })).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(thinkingLevelsForModel(undefined)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  test("falls back to the full canonical list when efforts is empty", () => {
    expect(
      thinkingLevelsForModel({ id: "empty-efforts", provider: "x", thinking: { efforts: [] } }),
    ).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  });
});

describe("thinking dropdown reflects the selected model's real support", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("only renders levels the current model supports, not the full static list", async () => {
    const models = [gappedModel];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        const request = JSON.parse(options.body);
        if (request.type === "get_available_models") {
          return Promise.resolve({ json: async () => ({ success: true, data: { models } }) });
        }
        if (request.type === "get_state") {
          return Promise.resolve({
            json: async () => ({
              success: true,
              data: {
                model: { id: gappedModel.id, provider: gappedModel.provider },
                thinkingLevel: "off",
              },
            }),
          });
        }
        throw new Error(`Unexpected RPC: ${request.type}`);
      }),
    );

    loadBody();
    const picker = setupModelPicker({
      settingsPanel: document.querySelector("#settings-panel"),
      composerCard: document.querySelector("#composer-card"),
      messageInput: document.querySelector("#message-input"),
      rpcCommand: vi.fn(),
      updateUI: () => {},
      updateTokenUsage: () => {},
      setContextWindowSize: () => {},
      hasAnySessionsLoaded: () => true,
      getCurrentWorkspacePath: () => "/tmp",
      openConfigurationSettings: async () => {},
    });
    await picker.fetchModelInfo();

    document.querySelector("#thinking-btn").click();
    const rendered = [...document.querySelectorAll(".thinking-dropdown-item")].map(
      (el) => el.textContent,
    );
    expect(rendered).toEqual(["off", "low", "high"]);
    expect(rendered).not.toContain("medium");
    expect(rendered).not.toContain("max");
  });
});
