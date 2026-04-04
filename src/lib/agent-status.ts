// In-memory status store for agent thinking steps (per-user)
// This allows the frontend to poll for live updates while the agent works

const statusStore = new Map<string, string[]>();

export function setAgentStatus(userId: string, step: string) {
  const steps = statusStore.get(userId) || [];
  steps.push(step);
  statusStore.set(userId, steps);
}

export function getAgentStatus(userId: string): string[] {
  return statusStore.get(userId) || [];
}

export function clearAgentStatus(userId: string) {
  statusStore.delete(userId);
}
