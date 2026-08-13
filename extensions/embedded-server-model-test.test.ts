// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseModelTestOutput } from "./embedded-server.ts";

const TURN_END = JSON.stringify({
  type: "turn_end",
  message: {
    stopReason: "stop",
    ttft: 2752.64,
    usage: { cost: { total: 0.00097 } },
  },
});

describe("parseModelTestOutput", () => {
  it("lee stop reason, ttft y costo de la línea turn_end", () => {
    const out = parseModelTestOutput(`{"type":"agent_start"}\n${TURN_END}\n`, "");
    expect(out.ok).toBe(true);
    expect(out.stopReason).toBe("stop");
    expect(out.ttftMs).toBe(2753);
    expect(out.costUsd).toBeCloseTo(0.00097);
  });

  it("falla cuando omp imprime texto plano y sale con 0 (modelo inexistente)", () => {
    const out = parseModelTestOutput('Model "noexiste/x" not found\n', "");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("not found");
  });

  it("ignora las líneas que no son JSON en vez de explotar", () => {
    const out = parseModelTestOutput(`basura no json\n${TURN_END}\n`, "");
    expect(out.ok).toBe(true);
  });
});
