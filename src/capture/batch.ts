import type { SidebarConversation } from "./sidebar";

export const UNRECOGNIZED_LIMIT = 3;

export type BatchPhase = "idle" | "running" | "paused" | "done" | "cancelled";

export type BatchOutcome = "stored" | "skipped" | "failed" | "unrecognized";

export type BatchState = {
  phase: BatchPhase;
  items: readonly SidebarConversation[];
  cursor: number;
  stored: number;
  skipped: number;
  failed: number;
  unrecognizedStreak: number;
  failures: readonly SidebarConversation[];
};

export function idleBatch(): BatchState {
  return {
    phase: "idle",
    items: [],
    cursor: 0,
    stored: 0,
    skipped: 0,
    failed: 0,
    unrecognizedStreak: 0,
    failures: [],
  };
}

export function startBatch(items: readonly SidebarConversation[]): BatchState {
  const unique: SidebarConversation[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  if (unique.length === 0) return idleBatch();
  return { ...idleBatch(), phase: "running", items: unique };
}

export function nextBatchId(state: BatchState): string | null {
  if (state.phase !== "running") return null;
  return state.items[state.cursor]?.id ?? null;
}

export function noteBatchResult(state: BatchState, outcome: BatchOutcome): BatchState {
  if (state.phase !== "running") return state;
  const current = state.items[state.cursor];
  const cursor = state.cursor + 1;
  const unrecognizedStreak = outcome === "unrecognized" ? state.unrecognizedStreak + 1 : 0;
  const finished = cursor >= state.items.length;
  const paused = !finished && unrecognizedStreak >= UNRECOGNIZED_LIMIT;
  const failed = outcome === "failed" || outcome === "unrecognized";
  return {
    phase: finished ? "done" : paused ? "paused" : "running",
    items: state.items,
    cursor,
    stored: state.stored + (outcome === "stored" ? 1 : 0),
    skipped: state.skipped + (outcome === "skipped" ? 1 : 0),
    failed: state.failed + (failed ? 1 : 0),
    unrecognizedStreak,
    failures: failed && current ? [...state.failures, current] : state.failures,
  };
}

export function resumeBatch(state: BatchState): BatchState {
  if (state.phase !== "paused" || state.cursor >= state.items.length) return state;
  return { ...state, phase: "running", unrecognizedStreak: 0 };
}

export function cancelBatch(state: BatchState): BatchState {
  if (state.phase !== "running" && state.phase !== "paused") return state;
  return { ...state, phase: "cancelled" };
}
