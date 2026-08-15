/**
 * State Manager - Manages chat state
 */

export class StateManager {
  constructor() {
    this.toolExecutions = new Map(); // toolCallId -> tool execution data
    this.isStreaming = false;
  }

  setStreaming(isStreaming) {
    this.isStreaming = isStreaming;
  }

  addToolExecution(toolCallId, data) {
    this.toolExecutions.set(toolCallId, {
      toolCallId,
      toolName: data.toolName,
      args: data.args,
      status: "pending",
      output: "",
      isError: false,
      ...data,
    });
  }

  updateToolExecution(toolCallId, updates) {
    const tool = this.toolExecutions.get(toolCallId);
    if (tool) {
      Object.assign(tool, updates);
    }
  }

  getToolExecution(toolCallId) {
    return this.toolExecutions.get(toolCallId);
  }

  reset() {
    this.toolExecutions.clear();
    this.isStreaming = false;
  }
}
