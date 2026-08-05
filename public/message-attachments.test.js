import { beforeEach, describe, expect, test, vi } from "vitest";
import { MessageRenderer } from "./message-renderer.js";
import { initTransport } from "./transport.js";

const attachmentPath = "/home/u/proj/AGENTS.md";

let sendControl;
let container;
let renderer;

beforeEach(() => {
  document.body.innerHTML = "";
  sendControl = vi.fn().mockResolvedValue(null);
  initTransport({ wsClient: { capabilities: { native: true }, sendControl } });
  container = document.createElement("div");
  document.body.appendChild(container);
  renderer = new MessageRenderer(container);
  renderer.renderUserMessage({ content: `mirá esto\n\n${attachmentPath}` });
});

describe("MessageRenderer attachment interactions", () => {
  test("renders file chips as accessible buttons with their paths", () => {
    const chip = container.querySelector(".file-chip");

    expect(chip.dataset.path).toBe(attachmentPath);
    expect(chip.getAttribute("role")).toBe("button");
    expect(chip.tabIndex).toBe(0);
  });

  test("opens a native attachment through the transport", () => {
    const chip = container.querySelector(".file-chip");

    chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(sendControl).toHaveBeenCalledWith(
      "open_in_app",
      { path: attachmentPath, appName: null, command: null },
      {},
    );
  });

  test("does not open attachments for a remote transport", () => {
    initTransport({ wsClient: { capabilities: { native: false }, sendControl } });
    const chip = container.querySelector(".file-chip");

    chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(sendControl).not.toHaveBeenCalled();
  });

  test("opens on Enter and ignores unrelated keys", () => {
    const chip = container.querySelector(".file-chip");

    chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sendControl).toHaveBeenCalledTimes(1);

    sendControl.mockClear();
    chip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(sendControl).not.toHaveBeenCalled();
  });

  test("delegates clicks for messages rendered after construction", () => {
    const laterPath = "/home/u/proj/README.md";
    renderer.renderUserMessage({ content: `otro mensaje\n\n${laterPath}` });
    const chips = container.querySelectorAll(".file-chip");

    chips[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(sendControl).toHaveBeenCalledWith(
      "open_in_app",
      { path: laterPath, appName: null, command: null },
      {},
    );
  });

  test("opens image thumbnails in the lightbox", () => {
    renderer.renderUserMessage({
      content: "mirá",
      images: [{ data: "data:image/png;base64,AAA" }],
    });
    const image = container.querySelector(".message-image");

    image.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const overlay = document.body.querySelector(".image-lightbox");
    expect(overlay).not.toBeNull();
    overlay.remove();
  });
});
