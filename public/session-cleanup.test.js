import { describe, expect, test } from "vitest";
import { collectSelectedFilePaths } from "./session-cleanup.js";

describe("collectSelectedFilePaths", () => {
  const missingProjects = [
    { dirName: "a", sessions: [{ filePath: "/x/1" }, { filePath: "/x/2" }] },
    { dirName: "b", sessions: [{ filePath: "/y/1" }] },
  ];

  test("collects only the sessions of selected projects", () => {
    expect(collectSelectedFilePaths(missingProjects, new Set(["a"]))).toEqual(["/x/1", "/x/2"]);
  });

  test("empty selection collects nothing", () => {
    expect(collectSelectedFilePaths(missingProjects, new Set())).toEqual([]);
  });

  test("multiple selected projects concatenate their sessions", () => {
    expect(collectSelectedFilePaths(missingProjects, new Set(["a", "b"]))).toEqual([
      "/x/1",
      "/x/2",
      "/y/1",
    ]);
  });
});
