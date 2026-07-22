import { describe, expect, it } from "vitest";
import { shouldPoll } from "./poll-gating.js";

describe("shouldPoll", () => {
  it("polls when focused and the 5s threshold has elapsed", () => {
    expect(shouldPoll(true, 5000)).toBe(true);
  });

  it("skips when focused but under the 5s threshold", () => {
    expect(shouldPoll(true, 4999)).toBe(false);
  });

  it("polls when unfocused and the 30s threshold has elapsed", () => {
    expect(shouldPoll(false, 30000)).toBe(true);
  });

  it("skips when unfocused and under the 30s threshold (even past 5s)", () => {
    expect(shouldPoll(false, 10000)).toBe(false);
  });
});
