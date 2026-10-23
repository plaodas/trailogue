export const UNRECOGNIZED_LIMIT = 3;

export type BatchPhase = "idle" | "running" | "paused" | "done" | "cancelled";

export type BatchOutcome = "stored" | "skipped" | "failed" | "unrecognized";

export type BatchState = {
  phase: BatchPhase;
  ids: readonly string[];
  cursor: number;
  stored: number;
  skipped: number;
  failed: number;
  unrecognizedStreak: number;
};

export function idleBatch(): BatchState {
  return {
    phase: "idle",
    ids: [],
    cursor: 0,
    stored: 0,
    skipped: 0,
    failed: 0,
    unrecognizedStreak: 0,
  };
}

export function startBatch(ids: readonly string[]): BatchState {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  if (unique.length === 0) return idleBatch();
  return { ...idleBatch(), phase: "running", ids: unique };
}

export function nextBatchId(state: BatchState): string | null {
  if (state.phase !== "running") return null;
  return state.ids[state.cursor] ?? null;
}

export function noteBatchResult(state: BatchState, outcome: BatchOutcome): BatchState {
  if (state.phase !== "running") return state;
  const cursor = state.cursor + 1;
  const unrecognizedStreak = outcome === "unrecognized" ? state.unrecognizedStreak + 1 : 0;
  const finished = cursor >= state.ids.length;
  const paused = !finished && unrecognizedStreak >= UNRECOGNIZED_LIMIT;
  return {
    phase: finished ? "done" : paused ? "paused" : "running",
    ids: state.ids,
    cursor,
    stored: state.stored + (outcome === "stored" ? 1 : 0),
    skipped: state.skipped + (outcome === "skipped" ? 1 : 0),
    failed: state.failed + (outcome === "failed" || outcome === "unrecognized" ? 1 : 0),
    unrecognizedStreak,
  };
}

export function resumeBatch(state: BatchState): BatchState {
  if (state.phase !== "paused" || state.cursor >= state.ids.length) return state;
  return { ...state, phase: "running", unrecognizedStreak: 0 };
}

export function cancelBatch(state: BatchState): BatchState {
  if (state.phase !== "running" && state.phase !== "paused") return state;
  return { ...state, phase: "cancelled" };
}
