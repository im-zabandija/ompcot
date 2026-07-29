import { describe, expect, it } from "vitest";
import { createTypingPacer } from "./typing-pacer.js";

// Scheduler falso: en vez de rAF real, guardamos los callbacks pendientes en una
// cola y los drenamos a mano con drainOneFrame()/drainAllFrames(). `cancel` falso
// registra los ids cancelados para poder verificar que un frame pendiente se cortó.
function createFakeScheduler() {
  let nextId = 1;
  const pending = new Map(); // id -> callback
  const cancelled = [];

  return {
    schedule(fn) {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    cancel(id) {
      cancelled.push(id);
      pending.delete(id);
    },
    cancelled,
    // Ejecuta el próximo callback encolado (si hay uno). Puede encolar otro a
    // continuación (el pacer se re-programa solo mientras haya backlog).
    drainOneFrame() {
      const [id] = pending.keys();
      if (id === undefined) return false;
      const fn = pending.get(id);
      pending.delete(id);
      fn();
      return true;
    },
    // Drena hasta que no queden frames pendientes o se llegue al límite de
    // seguridad (evita un loop infinito si algo queda mal cableado).
    drainAllFrames(maxFrames = 100) {
      let frames = 0;
      while (pending.size > 0 && frames < maxFrames) {
        this.drainOneFrame();
        frames += 1;
      }
      return frames;
    },
    pendingCount() {
      return pending.size;
    },
  };
}

describe("createTypingPacer", () => {
  it("reveals a strictly increasing prefix that ends at the full target", () => {
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    const target = "x".repeat(60);
    pacer.push(target);
    scheduler.drainAllFrames();

    expect(renders.length).toBeGreaterThan(0);
    for (let i = 1; i < renders.length; i += 1) {
      expect(renders[i].length).toBeGreaterThan(renders[i - 1].length);
      expect(renders[i].length).toBeLessThanOrEqual(target.length);
      expect(target.startsWith(renders[i])).toBe(true);
    }
    expect(renders[renders.length - 1]).toBe(target);
  });

  it("flush renders the full target once and cancels the pending frame", () => {
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    const target = "hello world, this is a longer chunk of streamed text";
    pacer.push(target);
    expect(scheduler.pendingCount()).toBe(1);

    pacer.flush();

    expect(renders).toEqual([target]);
    expect(scheduler.cancelled.length).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("paints the whole backlog in a single frame when unpaced", () => {
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      paced: () => false,
    });

    const target = "y".repeat(90);
    pacer.push(target);
    const framesRun = scheduler.drainAllFrames();

    expect(framesRun).toBe(1);
    expect(renders).toEqual([target]);
  });

  it("reset cancels the pending frame without rendering, and a later push starts from zero", () => {
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    pacer.push("first target text");
    expect(scheduler.pendingCount()).toBe(1);

    pacer.reset();

    expect(renders).toEqual([]);
    expect(scheduler.cancelled.length).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);

    const target = "second target, shown from scratch";
    pacer.push(target);
    scheduler.drainAllFrames();

    expect(renders[0].length).toBeLessThan(target.length);
    expect(target.startsWith(renders[0])).toBe(true);
    expect(renders[renders.length - 1]).toBe(target);
  });

  it("shrinking to a target shorter than shown clamps shown, so the next target starts from zero", () => {
    // Prueba de imposible-sin-clamp: si se saca `shown = Math.min(shown, target.length)`
    // de push() en typing-pacer.js, este test falla. Usamos minStep:1, divisor:1000 para
    // forzar exactamente 1 char revelado por frame y hacer la aritmética trivial.
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      minStep: 1,
      divisor: 1000,
    });

    pacer.push("a".repeat(20));
    scheduler.drainOneFrame(); // shown pasa a 1 (un solo char revelado)
    expect(renders[renders.length - 1]).toBe("a");

    // Achicamos el target a vacío: por debajo de shown=1. Con el clamp, shown baja a 0.
    // Sin el clamp, shown se queda clavado en 1 (residuo del target anterior).
    expect(() => pacer.push("")).not.toThrow();
    scheduler.drainOneFrame(); // el frame pendiente del target "a" corre pero no renderiza (backlog <= 0)

    pacer.push("c".repeat(10));
    scheduler.drainOneFrame();

    // Con clamp: shown arrancó en 0 -> este frame revela "c" (1 char, desde cero).
    // Sin clamp: shown seguía en 1 (del target "a" ya descartado) -> este frame revela
    // "cc" (2 chars), un salto que no corresponde a ningún progreso real sobre "c".
    expect(renders[renders.length - 1]).toBe("c");
  });

  it("push after reset() reveals a new shorter target from scratch (contrato del que depende el call site)", () => {
    // Repro del bug real: una burbuja vieja deja shown clavado en el final de un target
    // largo ya agotado. El fix vive en el call site (app-rpc-events.js llama reset() al
    // abrir cada burbuja nueva) -- este test fija ese contrato: CON reset(), un target
    // nuevo más corto sí se revela por completo.
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    pacer.push("A".repeat(500));
    scheduler.drainAllFrames(); // shown = 500, target agotado

    pacer.reset();
    const target = "B".repeat(200);
    pacer.push(target);
    pacer.flush();

    expect(renders[renders.length - 1]).toBe(target);
  });

  it("KNOWN LIMITATION: without reset(), pushing a shorter target right after a longer one drains renders nothing", () => {
    // Este es el bug que encontró el reviewer: sin reset() entre burbujas, el clamp deja
    // shown === target.length del target nuevo, así que ni push() agenda frame ni
    // flush() renderiza -- CERO renders, y el mensaje del asistente queda vacío aguas
    // arriba. Por eso el consumidor DEBE resetear el pacer al abrir cada burbuja nueva;
    // este test documenta el límite para que nadie lo saque "para simplificar".
    const renders = [];
    const scheduler = createFakeScheduler();
    const pacer = createTypingPacer({
      render: (text) => renders.push(text),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    pacer.push("A".repeat(500));
    scheduler.drainAllFrames();
    const beforeCount = renders.length;

    pacer.push("B".repeat(200));
    pacer.flush();

    expect(renders.length).toBe(beforeCount);
  });
});
