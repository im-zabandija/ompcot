/**
 * Custom select primitive — replaces a native <select>'s rendering with a
 * button trigger + listbox popover, keyboard-navigable (arrows/Enter/Escape)
 * and ARIA-compliant (role="listbox"/"option", aria-expanded, aria-selected).
 *
 * `enhanceSelect(selectEl)` is a drop-in replacement: it keeps the original
 * <select> in the DOM (hidden) as the single source of truth for `.value`
 * and dispatches a real `change` event on it, so any code that already
 * listens on that element keeps working unmodified.
 */

let uid = 0;

export function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.dataset.uiSelectEnhanced === "true") return selectEl.uiSelectWrap;
  selectEl.dataset.uiSelectEnhanced = "true";

  const id = `ui-select-${++uid}`;
  selectEl.style.display = "none";
  selectEl.setAttribute("aria-hidden", "true");
  selectEl.tabIndex = -1;

  const wrap = document.createElement("div");
  wrap.className = "ui-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-select-trigger";
  trigger.id = `${id}-trigger`;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "ui-select-value";
  trigger.appendChild(label);

  const listbox = document.createElement("ul");
  listbox.className = "ui-select-popover";
  listbox.id = `${id}-listbox`;
  listbox.setAttribute("role", "listbox");
  listbox.tabIndex = -1;
  listbox.hidden = true;
  trigger.setAttribute("aria-controls", listbox.id);

  let options = [];
  let activeIndex = -1;

  function buildOptions() {
    listbox.innerHTML = "";
    options = Array.from(selectEl.options).map((opt, index) => {
      const li = document.createElement("li");
      li.className = "ui-select-option";
      li.setAttribute("role", "option");
      li.id = `${id}-option-${index}`;
      li.textContent = opt.textContent;
      li.dataset.value = opt.value;
      if (opt.disabled) li.setAttribute("aria-disabled", "true");
      listbox.appendChild(li);
      return li;
    });
    syncSelected();
  }

  function syncSelected() {
    const idx = selectEl.selectedIndex;
    for (let i = 0; i < options.length; i++) {
      const selected = i === idx;
      options[i].setAttribute("aria-selected", String(selected));
      options[i].classList.toggle("is-selected", selected);
    }
    const current = selectEl.options[idx];
    label.textContent = current ? current.textContent : "";
  }

  function setActive(index) {
    if (activeIndex >= 0 && options[activeIndex]) {
      options[activeIndex].classList.remove("is-active");
    }
    activeIndex = index;
    const li = options[activeIndex];
    if (li) {
      li.classList.add("is-active");
      trigger.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView?.({ block: "nearest" });
    }
  }

  function onDocClick(e) {
    if (!wrap.contains(e.target)) close();
  }

  function open() {
    if (!listbox.hidden) return;
    listbox.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const startIndex = Math.max(selectEl.selectedIndex, 0);
    setActive(startIndex);
    document.addEventListener("click", onDocClick, true);
  }

  function close() {
    if (listbox.hidden) return;
    listbox.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    document.removeEventListener("click", onDocClick, true);
  }

  function commit(index) {
    const opt = options[index];
    if (!opt || opt.getAttribute("aria-disabled") === "true") return;
    if (selectEl.selectedIndex !== index) {
      selectEl.selectedIndex = index;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncSelected();
    close();
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (listbox.hidden) open();
    else close();
  });

  trigger.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (listbox.hidden) open();
        else setActive(Math.min(activeIndex + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (listbox.hidden) open();
        else setActive(Math.max(activeIndex - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (listbox.hidden) open();
        else commit(activeIndex);
        break;
      case "Escape":
        if (!listbox.hidden) {
          e.preventDefault();
          close();
        }
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  });

  listbox.addEventListener("click", (e) => {
    const li = e.target.closest(".ui-select-option");
    if (!li) return;
    const index = options.indexOf(li);
    if (index >= 0) commit(index);
  });

  listbox.addEventListener("mousemove", (e) => {
    const li = e.target.closest(".ui-select-option");
    if (!li) return;
    const index = options.indexOf(li);
    if (index >= 0 && index !== activeIndex) setActive(index);
  });

  selectEl.addEventListener("change", syncSelected);

  wrap.append(trigger, listbox);
  selectEl.insertAdjacentElement("afterend", wrap);
  buildOptions();

  selectEl.uiSelectWrap = wrap;
  return wrap;
}
