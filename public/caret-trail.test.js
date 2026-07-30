import { describe, expect, it } from "vitest";
import { clearCaretTrail, nextTrailFrame } from "./caret-trail.js";

describe("nextTrailFrame", () => {
  it("moves curX toward targetX without ever crossing it", () => {
    let curX = 0;
    const targetX = 100;
    for (let i = 0; i < 50; i++) {
      const { curX: next, settled } = nextTrailFrame(curX, targetX);
      expect(next).toBeGreaterThanOrEqual(curX);
      expect(next).toBeLessThanOrEqual(targetX);
      curX = next;
      if (settled) break;
    }
  });

  it("also converges without overshoot when curX starts above targetX", () => {
    let curX = 100;
    const targetX = 0;
    for (let i = 0; i < 50; i++) {
      const { curX: next, settled } = nextTrailFrame(curX, targetX);
      expect(next).toBeLessThanOrEqual(curX);
      expect(next).toBeGreaterThanOrEqual(targetX);
      curX = next;
      if (settled) break;
    }
  });

  it("settles to the target in a finite number of steps (anti-loop invariant)", () => {
    let curX = 0;
    const targetX = 100;
    let settled = false;
    const CAP = 200;
    let steps = 0;
    for (; steps < CAP; steps++) {
      const frame = nextTrailFrame(curX, targetX);
      curX = frame.curX;
      settled = frame.settled;
      if (settled) break;
    }
    expect(settled).toBe(true);
    expect(steps).toBeLessThan(CAP);
    expect(curX).toBe(targetX);
  });

  it("reports settled immediately when already at the target", () => {
    const { curX, dist, settled } = nextTrailFrame(42, 42);
    expect(curX).toBe(42);
    expect(dist).toBe(0);
    expect(settled).toBe(true);
  });
});

describe("clearCaretTrail", () => {
  it("does nothing (does not throw) when the element has no tracked trail", () => {
    expect(() => clearCaretTrail(document.createElement("div"))).not.toThrow();
  });

  it("does nothing (does not throw) when given null", () => {
    expect(() => clearCaretTrail(null)).not.toThrow();
  });
});
