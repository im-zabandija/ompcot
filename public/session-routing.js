export function findPortForSession(instances, sessionFile, fallbackPort) {
  const match = Array.isArray(instances)
    ? instances.find((instance) => instance?.sessionFile === sessionFile)
    : null;
  return typeof match?.port === "number" ? match.port : fallbackPort;
}

export function getWorkspacePathForPort(instances, port) {
  const match = Array.isArray(instances)
    ? instances.find((instance) => instance?.port === port)
    : null;
  return match?.cwd || "";
}

/**
 * A session selected from a different project must run in a process rooted
 * there: omp's switch_session does NOT re-root the process cwd
 * (SessionManager.setSessionFile keeps this.cwd; only moveTo changes it).
 */
// ponytail: strict string equality — a symlink/trailing-slash mismatch at worst
// spawns an extra dedicated process for the "same" project, which is still correct.
export function isCrossProjectSelection(selectedProjectPath, currentWorkspacePath) {
  return (
    Boolean(selectedProjectPath) &&
    Boolean(currentWorkspacePath) &&
    selectedProjectPath !== currentWorkspacePath
  );
}
