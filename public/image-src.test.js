import { describe, expect, it } from "vitest";
import { resolveImageSrc } from "./image-src.js";

const HASH = "a".repeat(64);

describe("resolveImageSrc", () => {
  it("resolves a blob ref with mime to the blob endpoint, token by query", () => {
    expect(resolveImageSrc({ data: `blob:sha256:${HASH}`, mimeType: "image/webp" }, "tok")).toBe(
      `/api/blob/${HASH}?mime=image%2Fwebp&accessToken=tok`,
    );
  });

  it("resolves a blob ref without mime, token only", () => {
    expect(resolveImageSrc({ data: `blob:sha256:${HASH}` }, "tok")).toBe(
      `/api/blob/${HASH}?accessToken=tok`,
    );
  });

  it("passes a full data URL through untouched", () => {
    expect(resolveImageSrc({ data: "data:image/png;base64,AAA" }, "tok")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("wraps raw base64 with the declared mime type", () => {
    expect(resolveImageSrc({ data: "AAA", mimeType: "image/webp" }, "tok")).toBe(
      "data:image/webp;base64,AAA",
    );
  });

  it("returns an empty string for empty data or a missing image", () => {
    expect(resolveImageSrc({ data: "" }, "tok")).toBe("");
    expect(resolveImageSrc(undefined, "tok")).toBe("");
  });
});
