import { beforeEach, describe, expect, it } from "vitest";

describe("vendor/chart.js", () => {
  beforeEach(() => {
    window.Chart = undefined;
  });

  it("exposes the Chart global when loaded", async () => {
    await import("./vendor/chart.js");
    expect(typeof window.Chart).toBe("function");
    expect(typeof window.Chart.register).toBe("function");
  });
});
