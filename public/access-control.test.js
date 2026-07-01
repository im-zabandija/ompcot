import { describe, expect, test, vi } from "vitest";
import {
  appendAccessToken,
  installAuthenticatedFetch,
  resolveAccessToken,
  stripSensitiveConnectionParams,
} from "./access-control.js";

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function makeEnv(search = "?accessToken=launch-secret") {
  return {
    fetch: vi.fn().mockResolvedValue({ ok: true }),
    Headers,
    Request,
    location: {
      href: `http://localhost:47821/${search}`,
      origin: "http://localhost:47821",
      search,
    },
    sessionStorage: makeStorage(),
  };
}

describe("access token handling", () => {
  test("persists the launch token for reloads", () => {
    const env = makeEnv();
    expect(resolveAccessToken(env)).toBe("launch-secret");
    env.location.search = "";
    expect(resolveAccessToken(env)).toBe("launch-secret");
  });

  test("adds the token to same-origin API requests only", async () => {
    const env = makeEnv();
    const originalFetch = env.fetch;
    installAuthenticatedFetch(env);

    await env.fetch("/api/sessions");
    const apiInit = originalFetch.mock.calls[0][1];
    expect(new Headers(apiInit.headers).get("X-Ompcot-Token")).toBe("launch-secret");

    await env.fetch("https://packages.example/api/packages");
    expect(originalFetch.mock.calls[1]).toEqual(["https://packages.example/api/packages", {}]);
  });

  test("appends a token without dropping existing query parameters", () => {
    expect(appendAccessToken("ws://localhost:47821/ws?mobile=1", "a b")).toBe(
      "ws://localhost:47821/ws?mobile=1&accessToken=a+b",
    );
  });

  test("removes connection secrets from the visible URL", () => {
    const replaceState = vi.fn();
    const env = {
      location: {
        href: "http://localhost:47821/?mobile=1&accessToken=secret&brokerWs=ws%3A%2F%2Fx",
      },
      history: { state: { existing: true }, replaceState },
    };

    stripSensitiveConnectionParams(env);

    expect(replaceState).toHaveBeenCalledWith(
      { existing: true },
      "",
      "http://localhost:47821/?mobile=1",
    );
  });
});
