import { beforeEach, describe, expect, it } from "vitest";
import { modelKey, topModels } from "./app-model-picker.js";
import { getPinnedModels, getRecentModels, pushRecentModel, togglePinnedModel } from "./themes.js";

// Paso 2 self-check: orden fijados/recientes (topModels) + persistencia por
// cookie (themes.js). Ver backlog-tanda-p2-plan.md §Verification.

const MODEL_COOKIES = ["ompcot-pinned-models", "ompcot-recent-models"];

function resetModelCookies() {
  // Cookies persisten entre tests en jsdom — expirarlas evita orden implícito.
  for (const name of MODEL_COOKIES) {
    // biome-ignore lint/suspicious/noDocumentCookie: test cleanup — sync expiry between cases
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

beforeEach(resetModelCookies);

const models = [
  { provider: "p", id: "a" },
  { provider: "p", id: "b" },
  { provider: "p", id: "c" },
  { provider: "p", id: "d" },
];

describe("topModels", () => {
  it("fija primero y completa con recientes hasta el límite", () => {
    expect(topModels(["p/a"], ["p/b", "p/c", "p/d"], models).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("nunca recorta los fijados al límite", () => {
    expect(topModels(["p/a", "p/b", "p/c", "p/d"], [], models).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("ignora recientes que ya no están disponibles, sin romper", () => {
    expect(topModels([], ["p/zz"], models)).toEqual([]);
  });

  // Regresión: `claude-opus-5` existe en anthropic y en opencode-zen. Indexando
  // por `id` pelado el último proveedor pisaba al primero y el fijado de
  // anthropic terminaba disparando set_model contra opencode-zen.
  it("no confunde modelos con el mismo id en distintos proveedores", () => {
    const dupes = [
      { provider: "anthropic", id: "claude-opus-5" },
      { provider: "opencode-zen", id: "claude-opus-5" },
    ];
    expect(topModels(["anthropic/claude-opus-5"], [], dupes)).toEqual([dupes[0]]);
    expect(modelKey(dupes[1])).toBe("opencode-zen/claude-opus-5");
  });
});

describe("pinned/recent model persistence (themes.js)", () => {
  it("pushRecentModel no duplica y deja el id repetido primero", () => {
    pushRecentModel("a");
    pushRecentModel("b");
    pushRecentModel("a");
    expect(getRecentModels()).toEqual(["a", "b"]);
  });

  it("togglePinnedModel fija y desfija", () => {
    expect(togglePinnedModel("a")).toEqual(["a"]);
    expect(getPinnedModels()).toEqual(["a"]);
    expect(togglePinnedModel("a")).toEqual([]);
    expect(getPinnedModels()).toEqual([]);
  });
});
