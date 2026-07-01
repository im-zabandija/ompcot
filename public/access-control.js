const ACCESS_TOKEN_STORAGE_KEY = "ompcot:access-token";
const AUTH_FETCH_MARKER = Symbol.for("ompcot.authenticated-fetch");

export function resolveAccessToken(env = globalThis.window || globalThis) {
  try {
    const search = env?.location?.search || "";
    const fromUrl = new URLSearchParams(search).get("accessToken")?.trim() || "";
    if (fromUrl) {
      env?.sessionStorage?.setItem?.(ACCESS_TOKEN_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return env?.sessionStorage?.getItem?.(ACCESS_TOKEN_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function appendAccessToken(url, accessToken) {
  if (!accessToken) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("accessToken", accessToken);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}accessToken=${encodeURIComponent(accessToken)}`;
  }
}

export function installAuthenticatedFetch(env = globalThis.window || globalThis) {
  const accessToken = resolveAccessToken(env);
  const currentFetch = env?.fetch;
  if (!accessToken || typeof currentFetch !== "function" || currentFetch[AUTH_FETCH_MARKER]) {
    return accessToken;
  }

  const originalFetch = currentFetch.bind(env);
  const locationHref = env?.location?.href || "http://localhost/";
  const locationOrigin = new URL(locationHref).origin;
  const HeadersClass = env?.Headers || globalThis.Headers;
  const RequestClass = env?.Request || globalThis.Request;

  const authenticatedFetch = (input, init = {}) => {
    const isRequest = typeof RequestClass === "function" && input instanceof RequestClass;
    const requestUrl = isRequest ? input.url : String(input);
    let target;
    try {
      target = new URL(requestUrl, locationHref);
    } catch {
      return originalFetch(input, init);
    }

    if (target.origin !== locationOrigin || !target.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const headers = new HeadersClass(isRequest ? input.headers : init.headers);
    headers.set("X-Ompcot-Token", accessToken);
    if (isRequest) {
      return originalFetch(new RequestClass(input, { ...init, headers }));
    }
    return originalFetch(input, { ...init, headers });
  };

  Object.defineProperty(authenticatedFetch, AUTH_FETCH_MARKER, { value: true });
  env.fetch = authenticatedFetch;
  return accessToken;
}

export function stripSensitiveConnectionParams(env = globalThis.window || globalThis) {
  try {
    const current = new URL(env.location.href);
    const hadSensitiveParams =
      current.searchParams.has("accessToken") || current.searchParams.has("brokerWs");
    if (!hadSensitiveParams) return;
    current.searchParams.delete("accessToken");
    current.searchParams.delete("brokerWs");
    env.history.replaceState(env.history.state, "", current.toString());
  } catch {}
}
