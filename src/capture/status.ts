export const DASHBOARD_READY = "trailogue:dashboard-ready";
export const DASHBOARD_STATUS = "trailogue:dashboard-status";

export type DashboardPhase = "reloading" | "ready" | "closed";

export type DashboardStatus = {
  type: typeof DASHBOARD_STATUS;
  generation: number;
  allowed: boolean;
  tabId: number | null;
  phase: DashboardPhase;
};

export function isDashboardReady(message: unknown): boolean {
  return isRecord(message) && message.type === DASHBOARD_READY;
}

export function isDashboardStatus(message: unknown): message is DashboardStatus {
  if (!isRecord(message)) return false;
  if (message.type !== DASHBOARD_STATUS) return false;
  if (typeof message.generation !== "number") return false;
  if (typeof message.allowed !== "boolean") return false;
  if (message.tabId !== null && typeof message.tabId !== "number") return false;
  return message.phase === "reloading" || message.phase === "ready" || message.phase === "closed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
