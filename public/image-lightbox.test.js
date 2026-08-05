import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openImageLightbox } from "./image-lightbox.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  if (document.querySelector(".image-lightbox")) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  }
  document.body.innerHTML = "";
});

describe("image lightbox", () => {
  test("renders the image in the shared cleanup overlay", () => {
    openImageLightbox("data:image/png;base64,AAA", "x");

    const overlay = document.querySelector(".image-lightbox");
    const image = overlay?.querySelector("img");
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains("cleanup-overlay")).toBe(true);
    expect(image).not.toBeNull();
    expect(image.src).toBe("data:image/png;base64,AAA");
    expect(image.alt).toBe("x");
  });

  test("closes when the backdrop itself is clicked", () => {
    openImageLightbox("data:image/png;base64,AAA");
    const overlay = document.querySelector(".image-lightbox");

    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".image-lightbox")).toBeNull();
  });

  test("does not close when the image is clicked", () => {
    openImageLightbox("data:image/png;base64,AAA");
    const image = document.querySelector(".image-lightbox img");

    image.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".image-lightbox")).not.toBeNull();
  });

  test("closes on Escape", () => {
    openImageLightbox("data:image/png;base64,AAA");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(document.querySelector(".image-lightbox")).toBeNull();
  });

  test("swallows Escape before the app bubble handler and removes the listener", () => {
    const appEscapeHandler = vi.fn();
    document.addEventListener("keydown", appEscapeHandler);
    openImageLightbox("data:image/png;base64,AAA");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(appEscapeHandler).not.toHaveBeenCalled();
    expect(document.querySelector(".image-lightbox")).toBeNull();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(appEscapeHandler).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".image-lightbox")).toBeNull();
    document.removeEventListener("keydown", appEscapeHandler);
  });
});
