import { afterEach, describe, expect, test, vi } from "vitest";
import { createOmpUpdater } from "./app-omp-updater.js";

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function setupUpdater(updateResult) {
  const checkBtn = document.createElement("button");
  const statusRow = document.createElement("div");
  const statusEl = document.createElement("span");
  const sidebarPill = document.createElement("button");
  const transport = {
    checkOmpUpdate: vi.fn().mockResolvedValue({
      success: true,
      updateAvailable: true,
      currentVersion: "1.0.0",
    }),
    updateOmp: vi.fn().mockResolvedValue(updateResult),
    relaunchApp: vi.fn().mockResolvedValue(undefined),
  };

  const updater = createOmpUpdater({
    transport,
    checkBtn,
    statusRow,
    statusEl,
    sidebarPill,
    onOpenSettings: vi.fn(),
  });
  updater.initOmpUpdaterUI();

  return { checkBtn, statusRow, statusEl, transport };
}

async function completeConfirm(button, selector) {
  button.click();
  await Promise.resolve();
  const confirmButton = document.querySelector(selector);
  expect(confirmButton).not.toBeNull();
  confirmButton.click();
  await settle();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("OMP updater restart", () => {
  test("offers restart after a successful update and relaunches after confirmation", async () => {
    const { checkBtn, transport } = setupUpdater({ success: true });
    await settle();

    expect(checkBtn.textContent).toBe("Update OMP");
    await completeConfirm(checkBtn, ".cleanup-confirm");

    expect(checkBtn.textContent).toBe("Restart Ompcot");
    await completeConfirm(checkBtn, ".cleanup-confirm");

    expect(transport.relaunchApp).toHaveBeenCalledTimes(1);
  });

  test("keeps restart available when the restart confirmation is cancelled", async () => {
    const { checkBtn, transport } = setupUpdater({ success: true });
    await settle();

    await completeConfirm(checkBtn, ".cleanup-confirm");
    expect(checkBtn.textContent).toBe("Restart Ompcot");

    await completeConfirm(checkBtn, ".cleanup-cancel");

    expect(transport.relaunchApp).not.toHaveBeenCalled();
    expect(checkBtn.textContent).toBe("Restart Ompcot");
  });

  test("reports a failed update and does not offer or perform a restart", async () => {
    const { checkBtn, statusRow, statusEl, transport } = setupUpdater({
      success: false,
      output: "boom",
    });
    await settle();

    await completeConfirm(checkBtn, ".cleanup-confirm");

    expect(checkBtn.textContent).toBe("Update OMP");
    expect(statusRow.hidden).toBe(false);
    expect(statusEl.textContent).toBe("Update failed: boom");
    expect(statusEl.dataset.tone).toBe("warn");
    expect(transport.relaunchApp).not.toHaveBeenCalled();
  });
});
