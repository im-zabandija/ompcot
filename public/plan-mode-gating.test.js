import { describe, expect, test } from "vitest";
import { planModeClickDecision } from "./plan-mode-gating.js";

describe("planModeClickDecision", () => {
  test("ignora el click reentrante mientras hay un toggle en vuelo", () => {
    expect(planModeClickDecision({ canQuery: true, isStreaming: false, inFlight: true })).toBe(
      "ignore",
    );
  });

  test("avisa en vez de quedarse mudo si hay un turno en curso", () => {
    expect(planModeClickDecision({ canQuery: true, isStreaming: true, inFlight: false })).toBe(
      "busy",
    );
  });

  test("avisa si todavía no se puede consultar", () => {
    expect(planModeClickDecision({ canQuery: false, isStreaming: false, inFlight: false })).toBe(
      "blocked",
    );
  });

  test("togglea cuando está todo listo", () => {
    expect(planModeClickDecision({ canQuery: true, isStreaming: false, inFlight: false })).toBe(
      "toggle",
    );
  });
});
