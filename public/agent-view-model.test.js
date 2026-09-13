import { describe, expect, it } from "vitest";
import {
  messageImages,
  messageText,
  messageThinking,
  toolCallView,
  toolResultView,
} from "./agent-view-model.js";

describe("messageText", () => {
  it("returns the content verbatim when it is a string", () => {
    expect(messageText({ content: "hola" })).toBe("hola");
  });

  it("returns only text blocks, ignoring thinking blocks", () => {
    const message = {
      content: [
        { type: "text", text: "a" },
        { type: "thinking", thinking: "z" },
      ],
    };
    expect(messageText(message)).toBe("a");
  });

  it("joins multiple text blocks with newlines", () => {
    const message = {
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };
    expect(messageText(message)).toBe("first\nsecond");
  });

  it("skips null blocks instead of throwing", () => {
    const message = {
      content: [null, { type: "text", text: "a" }],
    };
    expect(messageText(message)).toBe("a");
  });
});

describe("messageThinking", () => {
  it("joins thinking blocks with newlines", () => {
    const message = {
      content: [
        { type: "thinking", thinking: "first" },
        { type: "thinking", thinking: "second" },
      ],
    };
    expect(messageThinking(message)).toBe("first\nsecond");
  });

  it("returns an empty string when content is a string", () => {
    expect(messageThinking({ content: "no blocks" })).toBe("");
  });
});

describe("messageImages", () => {
  it("maps source-form image blocks", () => {
    const message = {
      content: [{ type: "image", source: { data: "abc", media_type: "image/png" } }],
    };
    expect(messageImages(message)).toEqual([{ data: "abc", mimeType: "image/png" }]);
  });

  it("maps flat image blocks", () => {
    const message = { content: [{ type: "image", data: "xyz", media_type: "image/jpeg" }] };
    expect(messageImages(message)).toEqual([{ data: "xyz", mimeType: "image/jpeg" }]);
  });

  it("returns an empty array when content is not an array", () => {
    expect(messageImages({ content: "not blocks" })).toEqual([]);
  });

  it("defaults mimeType to image/png when media_type is missing", () => {
    const message = { content: [{ type: "image", data: "zzz" }] };
    expect(messageImages(message)).toEqual([{ data: "zzz", mimeType: "image/png" }]);
  });

  it("prefers the wire mimeType over the image/png default", () => {
    const message = { content: [{ type: "image", data: "x", mimeType: "image/webp" }] };
    expect(messageImages(message)).toEqual([{ data: "x", mimeType: "image/webp" }]);
  });

  it("keeps reading the legacy source.media_type form", () => {
    const message = {
      content: [{ type: "image", source: { data: "y", media_type: "image/jpeg" } }],
    };
    expect(messageImages(message)).toEqual([{ data: "y", mimeType: "image/jpeg" }]);
  });
});

describe("toolCallView", () => {
  it("maps id, name, and arguments to the view", () => {
    const view = toolCallView({
      type: "toolCall",
      id: "t1",
      name: "edit",
      arguments: { path: "a.js" },
    });
    expect(view).toEqual({ toolCallId: "t1", toolName: "edit", args: { path: "a.js" } });
  });

  it("defaults args to an empty object when arguments is missing", () => {
    expect(toolCallView({ type: "toolCall", id: "t2", name: "read" }).args).toEqual({});
  });
});

describe("toolResultView", () => {
  it("extracts output, diff, and status from the envelope", () => {
    const view = toolResultView({
      content: [{ type: "text", text: "ok" }],
      details: { diff: " 3|x", path: "a.js", op: "edit", firstChangedLine: 3 },
    });
    expect(view.output).toBe("ok");
    expect(view.diff).toBe(" 3|x");
    expect(view.status).toBe("complete");
    expect(view.isError).toBe(false);
  });

  it("marks the view as error when isError is passed", () => {
    const view = toolResultView({ content: [{ type: "text", text: "boom" }] }, { isError: true });
    expect(view.status).toBe("error");
    expect(view.isError).toBe(true);
  });

  it("respects an explicit streaming status", () => {
    expect(
      toolResultView({ content: [{ type: "text", text: "partial" }] }, { status: "streaming" })
        .status,
    ).toBe("streaming");
  });

  it("returns an empty output and null diff for a null result", () => {
    const view = toolResultView(null);
    expect(view.output).toBe("");
    expect(view.diff).toBeNull();
    expect(view.status).toBe("complete");
  });

  it("stringifies non-text blocks instead of dropping them", () => {
    const view = toolResultView({ content: [{ type: "resource", uri: "x" }] });
    expect(view.output).toBe('{"type":"resource","uri":"x"}');
  });

  it("separates image blocks from the text output and flags details.isError", () => {
    const blob = `blob:sha256:${"a".repeat(64)}`;
    const view = toolResultView({
      content: [
        { type: "text", text: "ok" },
        { type: "image", data: blob, mimeType: "image/webp" },
      ],
      details: { isError: true },
    });
    expect(view.output).toBe("ok");
    expect(view.images).toEqual([{ data: blob, mimeType: "image/webp" }]);
    expect(view.isError).toBe(true);
    expect(view.status).toBe("error");
  });

  it("returns an empty images array when there are no image blocks", () => {
    expect(toolResultView({ content: [{ type: "text", text: "ok" }] }).images).toEqual([]);
  });

  it("skips null content blocks instead of stringifying them", () => {
    const view = toolResultView({ content: [null, { type: "text", text: "ok" }] });
    expect(view.output).toBe("ok");
  });

  it("does not flag details.timedOut as an error", () => {
    const view = toolResultView({
      content: [{ type: "text", text: "timed out" }],
      details: { timedOut: true },
    });
    expect(view.isError).toBe(false);
    expect(view.status).toBe("complete");
  });

  it("returns an empty output for a truthy result without content", () => {
    expect(toolResultView({ foo: "bar" }).output).toBe("");
  });

  it("normalizes an empty diff string to null", () => {
    expect(toolResultView({ content: [], details: { diff: "" } }).diff).toBeNull();
  });
});
