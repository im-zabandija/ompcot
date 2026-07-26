import { describe, expect, test } from "vitest";
import { base64ToFile } from "./app-composer.js";

// jsdom's File/Blob doesn't implement arrayBuffer(); FileReader is supported.
function readText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

describe("base64ToFile", () => {
  test("decodes base64 into a File whose bytes round-trip", async () => {
    const original = "PNGDATA";
    const file = base64ToFile(btoa(original), "image/png");
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/png");
    expect(await readText(file)).toBe(original);
  });

  test("falls back to image/png when mimeType is missing", () => {
    expect(base64ToFile(btoa("x"), undefined).type).toBe("image/png");
  });
});
