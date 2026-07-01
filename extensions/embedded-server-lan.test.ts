// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildLanAccessUrls, isAuthorizedAccess, LAN_BIND_HOST } from "./embedded-server.ts";

describe("embedded server LAN access helpers", () => {
  it("fails closed to loopback when the host does not provide a token", () => {
    expect(LAN_BIND_HOST).toBe("127.0.0.1");
  });

  it("builds token-protected mobile chat urls for every LAN host", () => {
    expect(buildLanAccessUrls(47821, ["192.168.1.20", "10.0.0.8"], "launch-secret")).toEqual([
      "http://192.168.1.20:47821/?mobile=1&accessToken=launch-secret",
      "http://10.0.0.8:47821/?mobile=1&accessToken=launch-secret",
    ]);
  });

  it("does not advertise LAN urls without a token", () => {
    expect(buildLanAccessUrls(47821, ["192.168.1.20"], "")).toEqual([]);
  });

  it("requires an exact token when the host provides one", () => {
    expect(isAuthorizedAccess("launch-secret", "launch-secret", "192.168.1.20:47821")).toBe(true);
    expect(isAuthorizedAccess("launch-secret", "wrong", "192.168.1.20:47821")).toBe(false);
    expect(isAuthorizedAccess("launch-secret", "", "127.0.0.1:47821")).toBe(false);
  });

  it("allows tokenless fallback only on loopback origins", () => {
    expect(isAuthorizedAccess("", "", "127.0.0.1:47821")).toBe(true);
    expect(isAuthorizedAccess("", "", "localhost:47821", "http://localhost:47821")).toBe(true);
    expect(isAuthorizedAccess("", "", "192.168.1.20:47821")).toBe(false);
    expect(isAuthorizedAccess("", "", "localhost:47821", "https://attacker.example")).toBe(false);
  });
});
