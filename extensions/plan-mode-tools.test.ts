// @vitest-environment node

import { describe, expect, it } from "vitest";
import { planModeReadOnlyTools } from "./embedded-server.ts";

describe("planModeReadOnlyTools", () => {
  it("extracts names from tool definition objects, not the objects themselves", () => {
    // Regression for the actual bug: getAllTools() returns
    // `{ name, description, sourceInfo }` objects. Filtering the allowlist
    // against that array directly (`allTools.includes(name)`) always came up
    // empty, since a string never `===` an object — plan mode refused to
    // turn on with "no read-only tools available" on every omp build.
    const allTools = [
      { name: "read", description: "…", sourceInfo: {} },
      { name: "bash", description: "…", sourceInfo: {} },
      { name: "glob", description: "…", sourceInfo: {} },
      { name: "grep", description: "…", sourceInfo: {} },
      { name: "edit", description: "…", sourceInfo: {} },
      { name: "write", description: "…", sourceInfo: {} },
      { name: "web_search", description: "…", sourceInfo: {} },
      { name: "todo", description: "…", sourceInfo: {} },
      { name: "ask", description: "…", sourceInfo: {} },
    ];

    expect(planModeReadOnlyTools(allTools)).toEqual([
      "read",
      "glob",
      "grep",
      "web_search",
      "todo",
      "ask",
    ]);
  });

  it("excludes write-capable tools even when present", () => {
    const allTools = [
      { name: "read", description: "…", sourceInfo: {} },
      { name: "write", description: "…", sourceInfo: {} },
      { name: "edit", description: "…", sourceInfo: {} },
      { name: "bash", description: "…", sourceInfo: {} },
    ];

    expect(planModeReadOnlyTools(allTools)).toEqual(["read"]);
  });

  it("returns an empty list when this omp build truly has none of the allowlist", () => {
    const allTools = [{ name: "write", description: "…", sourceInfo: {} }];

    expect(planModeReadOnlyTools(allTools)).toEqual([]);
  });

  it("tolerates a build whose getAllTools() returns bare name strings instead of objects", () => {
    // Defensive path: if some omp build ever reverts to returning plain
    // string names (which is what the original code wrongly assumed for
    // every build), the filter must not silently go back to comparing
    // mismatched shapes and returning [].
    expect(planModeReadOnlyTools(["read", "write", "bash"])).toEqual(["read"]);
  });
});
