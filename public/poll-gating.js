/**
 * Idle-resource gating for periodic instance polling.
 *
 * `pollInstances()` in app.js hits `/api/instances` on a fixed 5s ticker
 * regardless of whether the window is focused — wasted network/CPU while
 * the app sits in the background. This gate keeps the ticker but skips the
 * actual poll unless enough time has passed for the current focus state:
 * the normal 5s cadence while focused, a 30s cadence (6x slower, not
 * disabled entirely) while unfocused so a returning user still sees a
 * reasonably fresh sidebar/instance-indicator without a full refresh.
 */
export function shouldPoll(hasFocus, msSinceLastPoll) {
  const threshold = hasFocus ? 5000 : 30000;
  return msSinceLastPoll >= threshold;
}
