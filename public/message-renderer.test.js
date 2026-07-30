import { beforeEach, describe, expect, it } from "vitest";
import { MessageRenderer } from "./message-renderer.js";

describe("MessageRenderer streaming markdown preview", () => {
  let container;
  let renderer;

  beforeEach(() => {
    container = document.createElement("div");
    renderer = new MessageRenderer(container);
  });

  it("renders markdown live during streaming updates", () => {
    const el = renderer.renderAssistantMessage({ content: "" }, true);
    renderer.updateStreamingMessage(el, "hello **bold te");

    const content = el.querySelector(".message-content");
    expect(content.innerHTML).toContain("<strong>bold te</strong>");
  });

  it("finalizes from the raw text, not the rendered DOM", () => {
    const el = renderer.renderAssistantMessage({ content: "" }, true);
    renderer.updateStreamingMessage(el, "a **bold** word and `code`");
    renderer.finalizeStreamingMessage(el);

    const content = el.querySelector(".message-content");
    expect(content.innerHTML).toContain("<strong>bold</strong>");
    expect(content.innerHTML).toContain("<code>code</code>");
  });

  it("keeps a partial code block previewing as a code block", () => {
    const el = renderer.renderAssistantMessage({ content: "" }, true);
    renderer.updateStreamingMessage(el, "```js\nconst a = 1;");

    const content = el.querySelector(".message-content");
    expect(content.querySelector(".code-block-wrapper")).not.toBeNull();
    expect(content.textContent).toContain("const a = 1;");
  });

  it("preserves the thinking block while streaming text", () => {
    const el = renderer.renderAssistantMessage({ content: "" }, true);
    renderer.updateStreamingThinking(el, "pondering...");
    renderer.updateStreamingMessage(el, "some *italic");

    expect(el.querySelector(".streaming-thinking")).not.toBeNull();
    expect(el.querySelector(".streaming-text").innerHTML).toContain("<em>italic</em>");
  });

  it("does not render raw HTML from streamed text", () => {
    const el = renderer.renderAssistantMessage({ content: "" }, true);
    renderer.updateStreamingMessage(el, "`<script>alert(1)</script>`");

    const content = el.querySelector(".message-content");
    expect(content.querySelector("script")).toBeNull();
  });

  it("highlights keyword matches across rendered messages", () => {
    renderer.renderUserMessage({ content: "Alpha beta gamma" }, true);
    renderer.renderAssistantMessage({ content: "Beta appears twice: beta." }, false, true);

    const count = renderer.highlightSearchQuery("beta");
    const marks = container.querySelectorAll("mark");

    expect(count).toBe(3);
    expect(marks).toHaveLength(3);
    expect(marks[0].textContent.toLowerCase()).toBe("beta");
  });

  it("scrolls the first highlighted match into view", () => {
    renderer.renderAssistantMessage({ content: "jump to keyword" }, false, true);

    let scrolled = false;
    Element.prototype.scrollIntoView = () => {
      scrolled = true;
    };

    const count = renderer.highlightSearchQuery("keyword");

    expect(count).toBe(1);
    expect(scrolled).toBe(true);
  });
});

describe("MessageRenderer user attachments", () => {
  let container;
  let renderer;

  beforeEach(() => {
    container = document.createElement("div");
    renderer = new MessageRenderer(container);
  });

  it("pinta el bloque final de rutas como chips y no como texto", () => {
    renderer.renderUserMessage({ content: "revisá esto\n\n/a/b.md\n/c/d" });

    const chips = container.querySelectorAll(".message-file-chips .file-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].querySelector(".file-chip-name").textContent).toBe("b.md");
    expect(chips[0].querySelector(".file-chip-name").title).toBe("/a/b.md");
    const content = container.querySelector(".message-content");
    expect(content.textContent).toContain("revisá esto");
    expect(content.textContent).not.toContain("/a/b.md");
  });

  it("un mensaje sin adjuntos no cambia", () => {
    renderer.renderUserMessage({ content: "hola /help" });
    expect(container.querySelector(".message-file-chips")).toBeNull();
  });

  it("copiar sigue dando el prompt completo con las rutas", () => {
    renderer.renderUserMessage({ content: "revisá esto\n\n/a/b.md" });
    expect(container.querySelector(".message.user").dataset.copyText).toBe(
      "revisá esto\n\n/a/b.md",
    );
  });

  it("nunca interpola la ruta como markup", () => {
    renderer.renderUserMessage({ content: "/a/<script>alert(1)</script>" });
    const nameEl = container.querySelector(".file-chip-name");
    expect(container.querySelector("script")).toBeNull();
    // El nombre mostrado es el último segmento tras el último "/" (incluido el que
    // trae el propio payload) — cosmético, no de seguridad. Lo que importa es que
    // nunca se crea un <script> real (chequeado arriba).
    expect(nameEl.textContent).toBe("script>");
  });
});
