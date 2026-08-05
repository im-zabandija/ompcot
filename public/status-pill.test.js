import { describe, expect, it } from "vitest";
import { statusPillText } from "./status-pill.js";

describe("statusPillText", () => {
  it("keeps Working status while preserving the LAN share URL", () => {
    expect(statusPillText({ isStreaming: true, lanUrl: "http://192.168.1.5:47821" })).toEqual({
      text: "Working...",
      title: "http://192.168.1.5:47821",
    });
  });

  it("prefers Tailscale when both connection URLs are available", () => {
    expect(
      statusPillText({
        tailscaleUrl: "https://example.ts.net:47821",
        lanUrl: "http://192.168.1.5:47821",
      }),
    ).toEqual({ text: "Connected • TS", title: "https://example.ts.net:47821" });
  });

  it("uses the LAN suffix when only a LAN URL is available", () => {
    expect(statusPillText({ lanUrl: "http://192.168.1.5:47821" })).toEqual({
      text: "Connected • LAN",
      title: "http://192.168.1.5:47821",
    });
  });

  it("uses the Tailscale suffix when only a Tailscale URL is available", () => {
    expect(statusPillText({ tailscaleUrl: "https://example.ts.net:47821" })).toEqual({
      text: "Connected • TS",
      title: "https://example.ts.net:47821",
    });
  });

  it("returns a bare idle pill without a stale title", () => {
    expect(statusPillText({})).toEqual({ text: "Connected", title: "" });
  });

  it("defaults to a bare idle pill when called without arguments", () => {
    expect(statusPillText()).toEqual({ text: "Connected", title: "" });
  });
});
