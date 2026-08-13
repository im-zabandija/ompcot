/**
 * Decisión pura del click en el toggle de Plan mode.
 *
 * El handler original salía con un `return` mudo cuando había un turno en
 * curso o el onboarding no permitía consultar, así que el click "no hacía
 * nada" sin explicar por qué. Acá la rama se decide en un solo lugar
 * testeable — mismo patrón que poll-gating.js y status-pill.js.
 */
export function planModeClickDecision({ canQuery, isStreaming, inFlight }) {
  if (inFlight) return "ignore";
  if (isStreaming) return "busy";
  if (!canQuery) return "blocked";
  return "toggle";
}

export const PLAN_MODE_CLICK_MESSAGE = {
  busy: "Plan mode: esperá a que termine el turno",
  blocked: "Plan mode: configurá un modelo primero",
};
