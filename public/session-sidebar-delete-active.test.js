import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { t } from "./i18n.js";
import { SessionSidebar } from "./session-sidebar.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionSidebar deleteSession on the active session", () => {
  test("shows a clear message and never calls the delete endpoint", async () => {
    const dom = new JSDOM('<div id="sessions"></div>', { url: "http://localhost" });
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const sidebar = new SessionSidebar(document.getElementById("sessions"), vi.fn(), vi.fn());
    sidebar.setActive("active.jsonl");

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const deletePromise = sidebar.deleteSession({
      filePath: "active.jsonl",
      name: "Active session",
    });

    // No silent no-op: a dialog must be shown to the user.
    const dialog = document.querySelector(".cleanup-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(t("sessionSidebar.cantDeleteActiveTitle"));

    dialog.querySelector(".cleanup-cancel").click();
    await deletePromise;

    // The backend must never be asked to delete the file omp is writing to.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("still deletes a non-active, non-streaming session normally", async () => {
    const dom = new JSDOM('<div id="sessions"></div>', { url: "http://localhost" });
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const sidebar = new SessionSidebar(document.getElementById("sessions"), vi.fn(), vi.fn());
    sidebar.setActive("active.jsonl");
    sidebar.loadSessions = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => ({ deleted: 1 }) });

    const deletePromise = sidebar.deleteSession({ filePath: "other.jsonl", name: "Other session" });

    // Confirm the "Delete session?" prompt.
    const confirmBtn = document.querySelector(".cleanup-delete");
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    await deletePromise;

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/sessions/delete-batch",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
