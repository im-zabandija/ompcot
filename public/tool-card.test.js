import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolCardRenderer } from "./tool-card.js";

describe("ToolCardRenderer re-run action", () => {
  let container;
  let input;
  let renderer;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    input = document.createElement("textarea");
    input.id = "message-input";
    document.body.appendChild(input);
    renderer = new ToolCardRenderer(container);
  });

  afterEach(() => {
    container.remove();
    input.remove();
  });

  it("renders a rerun button on tool cards with a command arg", () => {
    renderer.createToolCard({
      toolCallId: "1",
      toolName: "bash",
      args: { command: "ls -la" },
      status: "complete",
    });
    expect(container.querySelector(".rerun-btn")).not.toBeNull();
  });

  it("omits the rerun button when args has no command", () => {
    renderer.createToolCard({
      toolCallId: "2",
      toolName: "read",
      args: { path: "foo.js" },
      status: "complete",
    });
    expect(container.querySelector(".rerun-btn")).toBeNull();
  });

  it("populates #message-input and focuses it when the rerun button is clicked", () => {
    renderer.createToolCard({
      toolCallId: "3",
      toolName: "bash",
      args: { command: "echo hi" },
      status: "complete",
    });
    const btn = container.querySelector(".rerun-btn");
    btn.click();
    expect(input.value).toBe("Re-run: `echo hi`");
    expect(document.activeElement).toBe(input);
  });

  it("renders and wires the rerun button on history cards too", () => {
    renderer.createHistoryCard({
      toolCallId: "4",
      toolName: "bash",
      args: { command: "pwd" },
    });
    const btn = container.querySelector(".rerun-btn");
    expect(btn).not.toBeNull();
    btn.click();
    expect(input.value).toBe("Re-run: `pwd`");
  });

  it("omits the rerun button on history cards without a command arg", () => {
    renderer.createHistoryCard({
      toolCallId: "5",
      toolName: "read",
      args: { path: "foo.js" },
    });
    expect(container.querySelector(".rerun-btn")).toBeNull();
  });
});

describe("ToolCardRenderer.parseEditDiff", () => {
  let renderer;

  beforeEach(() => {
    renderer = new ToolCardRenderer(document.createElement("div"));
  });

  it("parses context, add, remove, and gap lines from a real OMP diff", () => {
    const diff = [
      ' 15|import { getFileIcon } from "./file-browser.js";',
      '+16|import { composePromptText } from "./prompt-attachments.js";',
      " 16|",
      "-24|/** comentario viejo */",
      "",
      " 31|export function setupComposer({",
    ].join("\n");

    const entries = renderer.parseEditDiff(diff);

    expect(entries.map((e) => e.kind)).toEqual(["ctx", "add", "ctx", "rem", "gap", "ctx"]);
    expect(entries.map((e) => e.line)).toEqual([15, 16, 16, 24, null, 31]);
    expect(entries[1].text).toBe('import { composePromptText } from "./prompt-attachments.js";');
    expect(entries[2].text).toBe("");
  });

  it("returns an empty array for an empty diff", () => {
    expect(renderer.parseEditDiff("")).toEqual([]);
  });
});
