import { beforeEach, describe, expect, it } from "vitest";
import { markStreamTail } from "./stream-tail.js";

let container;

beforeEach(() => {
  container = document.createElement("div");
});

describe("markStreamTail", () => {
  it("wraps the trailing word of the last text node in span.stream-tail", () => {
    container.innerHTML = "<p>hello wor</p>";
    const span = markStreamTail(container);
    expect(span).not.toBeNull();
    expect(span.className).toBe("stream-tail");
    expect(span.textContent).toBe("wor");
    expect(container.textContent).toBe("hello wor");
  });

  it("returns null when the text ends in whitespace (no word in progress)", () => {
    container.innerHTML = "<p>hello world </p>";
    expect(markStreamTail(container)).toBeNull();
    expect(container.textContent).toBe("hello world ");
  });

  it("returns null when the last text node lives inside a code block", () => {
    container.innerHTML = "<p>before</p><pre><code>const x = fo</code></pre>";
    expect(markStreamTail(container)).toBeNull();
    expect(container.textContent).toBe("beforeconst x = fo");
  });

  it("returns null for an empty container", () => {
    expect(markStreamTail(container)).toBeNull();
  });

  it("returns null when given no container", () => {
    expect(markStreamTail(null)).toBeNull();
  });

  it("never changes container.textContent — finalizeStreamingMessage's fallback depends on it", () => {
    container.innerHTML = "<p>the quick brown fo</p>";
    const before = container.textContent;
    markStreamTail(container);
    expect(container.textContent).toBe(before);
  });
});
