import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { enhanceSelect } from "./ui-select.js";

function renderSelect() {
  const select = document.createElement("select");
  for (const [value, text] of [
    ["a", "Opción A"],
    ["b", "Opción B"],
    ["c", "Opción C"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  }
  select.value = "a";
  document.body.appendChild(select);
  return select;
}

function keydown(el, key) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("enhanceSelect", () => {
  test("hides the native select and renders a trigger with the current value", () => {
    const select = renderSelect();
    enhanceSelect(select);

    expect(select.style.display).toBe("none");
    const trigger = document.querySelector(".ui-select-trigger");
    expect(trigger.textContent).toBe("Opción A");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("value set before enhanceSelect is reflected in the trigger label (locale-select regression)", () => {
    // Repro of the P0 fix: app-settings-panel.js sets localeSelect.value to
    // the active locale (e.g. "en") BEFORE calling enhanceSelect. The
    // trigger label must reflect that value, not the first <option>.
    const select = renderSelect();
    select.value = "b";
    enhanceSelect(select);

    const trigger = document.querySelector(".ui-select-trigger");
    expect(trigger.textContent).toBe("Opción B");
  });

  test("mouse click opens the popover, selecting an option updates value and fires change", () => {
    const select = renderSelect();
    let changeValue = null;
    select.addEventListener("change", () => {
      changeValue = select.value;
    });
    enhanceSelect(select);

    const trigger = document.querySelector(".ui-select-trigger");
    click(trigger);

    const listbox = document.querySelector(".ui-select-popover");
    expect(listbox.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const optionB = listbox.querySelectorAll(".ui-select-option")[1];
    click(optionB);

    expect(select.value).toBe("b");
    expect(changeValue).toBe("b");
    expect(listbox.hidden).toBe(true);
    expect(optionB.getAttribute("aria-selected")).toBe("true");
    expect(trigger.textContent).toBe("Opción B");
  });

  test("keyboard: ArrowDown navigates, Enter selects, Escape closes without changing value", () => {
    const select = renderSelect();
    enhanceSelect(select);
    const trigger = document.querySelector(".ui-select-trigger");
    const listbox = document.querySelector(".ui-select-popover");

    keydown(trigger, "ArrowDown"); // opens, active = current (index 0)
    expect(listbox.hidden).toBe(false);

    keydown(trigger, "ArrowDown"); // active -> index 1 ("b")
    keydown(trigger, "Enter");

    expect(select.value).toBe("b");
    expect(listbox.hidden).toBe(true);

    // Reopen and escape should close without committing a change.
    keydown(trigger, "ArrowDown");
    expect(listbox.hidden).toBe(false);
    keydown(trigger, "Escape");
    expect(listbox.hidden).toBe(true);
    expect(select.value).toBe("b");
  });

  test("role/aria structure matches a listbox popover", () => {
    const select = renderSelect();
    enhanceSelect(select);
    const listbox = document.querySelector(".ui-select-popover");
    const options = listbox.querySelectorAll(".ui-select-option");

    expect(listbox.getAttribute("role")).toBe("listbox");
    expect(options).toHaveLength(3);
    for (const opt of options) {
      expect(opt.getAttribute("role")).toBe("option");
    }
  });

  test("clicking outside closes the popover", () => {
    const select = renderSelect();
    enhanceSelect(select);
    const trigger = document.querySelector(".ui-select-trigger");
    const listbox = document.querySelector(".ui-select-popover");

    click(trigger);
    expect(listbox.hidden).toBe(false);

    click(document.body);
    expect(listbox.hidden).toBe(true);
  });
});
