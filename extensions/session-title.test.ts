// @vitest-environment node

import { describe, expect, it } from "vitest";
import { sessionTitleFromEntry } from "./embedded-server.ts";

describe("sessionTitleFromEntry", () => {
  it("reads the title from a `title` entry (the shape omp actually writes)", () => {
    expect(sessionTitleFromEntry({ type: "title", title: "Mi título" })).toBe("Mi título");
  });

  it("ignores an empty title instead of blanking a previously parsed one", () => {
    // The real .jsonl format rewrites the title entry in place on every rename,
    // so blank/placeholder rows show up; they must not clobber a real title.
    expect(sessionTitleFromEntry({ type: "title", title: "" })).toBeNull();
    expect(sessionTitleFromEntry({ type: "title", title: "   " })).toBeNull();
  });

  it("lets the last non-empty title win across repeated rows", () => {
    const rows = [
      { type: "title", title: "First name" },
      { type: "title", title: "" },
      { type: "title", title: "Renamed session" },
    ];

    let sessionName: string | null = null;
    for (const row of rows) {
      const t = sessionTitleFromEntry(row);
      if (t) sessionName = t;
    }

    expect(sessionName).toBe("Renamed session");
  });

  it("falls back to the legacy session_info/name shape when there's no title entry", () => {
    expect(sessionTitleFromEntry({ type: "session_info", name: "Legacy" })).toBe("Legacy");
  });

  it("returns null when neither shape is present, so callers fall back to the first message", () => {
    expect(sessionTitleFromEntry({ type: "message" })).toBeNull();
    expect(sessionTitleFromEntry({ type: "session_info" })).toBeNull();
    expect(sessionTitleFromEntry({})).toBeNull();
  });
});
