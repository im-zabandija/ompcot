import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createDialogShell } from "./ui-dialog.js";

describe("createDialogShell", () => {
  test("mounts .ui-overlay/.ui-dialog with full ARIA wiring", () => {
    const { overlay, dialog, titleEl } = createDialogShell({ title: "Delete session" });

    expect(overlay.className).toBe("ui-overlay");
    expect(overlay.contains(dialog)).toBe(true);

    expect(dialog.className).toBe("ui-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe(titleEl.id);

    expect(dialog.contains(titleEl)).toBe(true);
    expect(titleEl.textContent).toBe("Delete session");
    expect(document.getElementById(titleEl.id)).toBeNull(); // not mounted yet
  });

  test("generates unique title ids across instances", () => {
    const a = createDialogShell({ title: "A" });
    const b = createDialogShell({ title: "B" });
    expect(a.titleEl.id).not.toBe(b.titleEl.id);
  });
});

describe("design-system.css primitives", () => {
  const css = readFileSync(join(process.cwd(), "public/design-system.css"), "utf8");

  test("defines .ui-overlay and .ui-dialog", () => {
    expect(css).toMatch(/\.ui-overlay\s*\{/);
    expect(css).toMatch(/\.ui-dialog\s*\{/);
  });
});
