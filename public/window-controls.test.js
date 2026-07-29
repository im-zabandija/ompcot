import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setupWindowControls } from "./window-controls.js";

// Doble de @tauri-apps/api/window: todos los métodos que setupWindowControls
// invoca, cada uno resolviendo por default (igual que el IPC real en el
// camino feliz). Cada test override-ea solo lo que necesita.
function makeWin(overrides = {}) {
  return {
    startDragging: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    minimize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    isDecorated: vi.fn(async () => false),
    isMaximized: vi.fn(async () => false),
    startResizeDragging: vi.fn(async () => {}),
    onResized: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeTauri(win) {
  return { window: { getCurrentWindow: () => win } };
}

function mousedown(el, opts = {}) {
  el.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...opts }),
  );
}

function dblclick(el, opts = {}) {
  el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, ...opts }));
}

// Vacía la cola de microtasks sin recurrir a timers reales: syncMaximized()
// se dispara "fire and forget" en el setup, así que su continuación (tras el
// await interno a isMaximized) puede resolver un par de ticks después de que
// la promesa de setupWindowControls ya se resolvió.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function renderDragZone() {
  document.body.innerHTML = `
    <div id="header" data-window-drag>
      <span id="plain-spot">drag me</span>
      <button id="a-button" type="button">click</button>
      <input id="a-input" type="text" />
    </div>
  `;
}

function renderTitlebar() {
  document.body.innerHTML = `
    <div id="window-controls">
      <button id="window-minimize" type="button"></button>
      <button id="window-maximize" type="button"></button>
      <button id="window-close" type="button"></button>
    </div>
    <div id="window-resize-handles">
      <div data-resize="North"></div>
      <div data-resize="NorthEast"></div>
    </div>
  `;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
});

describe("drag delegado (1)", () => {
  test("mousedown izquierdo dentro de [data-window-drag] arrastra la ventana", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.getElementById("plain-spot"));

    expect(win.startDragging).toHaveBeenCalledTimes(1);
  });

  test("botón derecho no dispara drag", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.getElementById("plain-spot"), { button: 2 });

    expect(win.startDragging).not.toHaveBeenCalled();
  });
});

describe("exclusión de interactivos (2)", () => {
  test("mousedown sobre un <button> dentro del drag zone no arrastra", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.getElementById("a-button"));

    expect(win.startDragging).not.toHaveBeenCalled();
  });

  test("mousedown sobre un <input> dentro del drag zone no arrastra", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.getElementById("a-input"));

    expect(win.startDragging).not.toHaveBeenCalled();
  });
});

describe("doble click (3)", () => {
  test("dblclick en zona de drag maximiza/restaura", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    dblclick(document.getElementById("plain-spot"));

    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  test("dblclick sobre un botón interno no maximiza", async () => {
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    dblclick(document.getElementById("a-button"));

    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });
});

describe("gate macOS (4)", () => {
  test("no agrega custom-titlebar ni consulta isDecorated, pero el drag sigue andando", async () => {
    document.documentElement.classList.add("macos-overlay");
    renderDragZone();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    expect(document.documentElement.classList.contains("custom-titlebar")).toBe(false);
    expect(win.isDecorated).not.toHaveBeenCalled();

    mousedown(document.getElementById("plain-spot"));
    expect(win.startDragging).toHaveBeenCalledTimes(1);
  });
});

describe("gate sin Tauri (5)", () => {
  test("resuelve sin tirar, no agrega custom-titlebar, y el drag zone no explota", async () => {
    renderDragZone();

    await expect(setupWindowControls({ tauri: undefined })).resolves.toBeUndefined();
    expect(document.documentElement.classList.contains("custom-titlebar")).toBe(false);

    expect(() => mousedown(document.getElementById("plain-spot"))).not.toThrow();
  });
});

describe("gate ventana decorada (6)", () => {
  test("isDecorated -> true: no agrega custom-titlebar", async () => {
    renderDragZone();
    const win = makeWin({ isDecorated: vi.fn(async () => true) });
    await setupWindowControls({ tauri: makeTauri(win) });

    expect(document.documentElement.classList.contains("custom-titlebar")).toBe(false);
  });
});

describe("gate robusto ante fallo de IPC (7)", () => {
  test("isDecorated rechazada => se asume sin decoración y se agrega custom-titlebar", async () => {
    renderDragZone();
    const win = makeWin({ isDecorated: vi.fn(async () => Promise.reject(new Error("ipc down"))) });

    await setupWindowControls({ tauri: makeTauri(win) });

    expect(document.documentElement.classList.contains("custom-titlebar")).toBe(true);
  });
});

describe("botones de control (8)", () => {
  test("minimizar/maximizar/cerrar delegan al comando de Tauri correspondiente", async () => {
    renderTitlebar();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    document.getElementById("window-minimize").click();
    expect(win.minimize).toHaveBeenCalledTimes(1);

    document.getElementById("window-maximize").click();
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);

    document.getElementById("window-close").click();
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});

describe("sync de maximizado (9)", () => {
  test("dataset.maximized refleja isMaximized() al iniciar y cuando el WM dispara onResized", async () => {
    renderTitlebar();
    let maximized = false;
    let onResizedCallback;
    const win = makeWin({
      isMaximized: vi.fn(async () => maximized),
      onResized: vi.fn(async (cb) => {
        onResizedCallback = cb;
      }),
    });

    await setupWindowControls({ tauri: makeTauri(win) });
    await flushMicrotasks();

    const controls = document.getElementById("window-controls");
    expect(controls.dataset.maximized).toBe("false");
    expect(win.onResized).toHaveBeenCalledTimes(1);

    // El WM maximiza la ventana por su cuenta (doble click en el header del
    // compositor, atajo): onResized dispara y el estado debe re-sincronizarse.
    maximized = true;
    await onResizedCallback();

    expect(controls.dataset.maximized).toBe("true");
  });
});

describe("resize delegado (10)", () => {
  test("mousedown sobre un handle con data-resize llama startResizeDragging con ESE string", async () => {
    renderTitlebar();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.querySelector('[data-resize="NorthEast"]'));

    expect(win.startResizeDragging).toHaveBeenCalledTimes(1);
    expect(win.startResizeDragging).toHaveBeenCalledWith("NorthEast");
  });

  test("mousedown sobre el contenedor sin data-resize no llama nada", async () => {
    renderTitlebar();
    const win = makeWin();
    await setupWindowControls({ tauri: makeTauri(win) });

    mousedown(document.getElementById("window-resize-handles"));

    expect(win.startResizeDragging).not.toHaveBeenCalled();
  });
});
