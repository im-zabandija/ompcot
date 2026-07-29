/**
 * Typing pacer — reveals streaming assistant text in even increments instead of
 * repainting the full DOM once per WebSocket delta (which re-parses the whole
 * markdown on every chunk: O(n²) over the stream).
 *
 * The stream handler already accumulates the COMPLETE target text upstream, so
 * the pacer only needs to paint a growing prefix of it. `schedule`/`cancel` are
 * injectable so tests drive frames without a real rAF.
 */
export function createTypingPacer({
  render,
  schedule = (fn) => requestAnimationFrame(fn),
  cancel = (id) => cancelAnimationFrame(id),
  minStep = 3,
  divisor = 6,
  paced = () => true,
} = {}) {
  let target = "";
  let shown = 0;
  let frame = 0;

  function tick() {
    frame = 0;
    const backlog = target.length - shown;
    if (backlog <= 0) return;
    const step = paced() ? Math.max(minStep, Math.ceil(backlog / divisor)) : backlog;
    shown = Math.min(target.length, shown + step);
    render(target.slice(0, shown));
    if (shown < target.length) frame = schedule(tick);
  }

  return {
    push(text) {
      target = text;
      shown = Math.min(shown, target.length);
      if (shown < target.length && !frame) frame = schedule(tick);
    },
    flush() {
      if (frame) {
        cancel(frame);
        frame = 0;
      }
      if (shown < target.length) {
        shown = target.length;
        render(target);
      }
    },
    reset() {
      if (frame) cancel(frame);
      frame = 0;
      target = "";
      shown = 0;
    },
  };
}
