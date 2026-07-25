import { describe, expect, test } from "vitest";
import {
  findPortForSession,
  getWorkspacePathForPort,
  isCrossProjectSelection,
} from "./session-routing.js";

describe("session routing helpers", () => {
  const instances = [
    { port: 47821, sessionFile: "/tmp/session-a.jsonl", cwd: "/tmp/a" },
    { port: 47822, sessionFile: "/tmp/session-b.jsonl", cwd: "/tmp/b" },
  ];

  test("resolves the active omp process by selected session file", () => {
    expect(findPortForSession(instances, "/tmp/session-b.jsonl", 47821)).toBe(47822);
  });

  test("resolves workspace path from the active omp process port", () => {
    expect(getWorkspacePathForPort(instances, 47822)).toBe("/tmp/b");
  });
});

describe("isCrossProjectSelection", () => {
  test("true when the selected session belongs to another project", () => {
    expect(isCrossProjectSelection("/tmp/b", "/tmp/a")).toBe(true);
  });

  test("false for the same project (cheap in-place switch)", () => {
    expect(isCrossProjectSelection("/tmp/a", "/tmp/a")).toBe(false);
  });

  test("false when the selected project is unknown (never force a spawn)", () => {
    expect(isCrossProjectSelection("", "/tmp/a")).toBe(false);
  });

  test("false when the current workspace is unknown (bootstrap)", () => {
    expect(isCrossProjectSelection("/tmp/b", "")).toBe(false);
  });
});
