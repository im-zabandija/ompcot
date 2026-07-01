import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveOmpAgentRoot } from "./embedded-server";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ompcot-home-"));
  tempDirs.push(home);
  return home;
}

describe("resolveOmpAgentRoot", () => {
  it("uses the existing ~/.omp/agent directory", () => {
    const home = makeHome();
    const agentRoot = path.join(home, ".omp", "agent");
    fs.mkdirSync(agentRoot, { recursive: true });

    expect(resolveOmpAgentRoot([home], undefined)).toBe(agentRoot);
  });

  it("falls back to ~/.omp/agent instead of the legacy ~/.pi path", () => {
    const home = makeHome();

    expect(resolveOmpAgentRoot([home], undefined)).toBe(path.join(home, ".omp", "agent"));
  });
});
