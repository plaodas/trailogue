import type { ParseResult, RawCapture } from "../domain/types";
import { cancelBatch, nextBatchId, noteBatchResult, type BatchOutcome, type BatchState } from "./batch";

type BatchRead = ParseResult | { closed: true };

function isClosedRead(result: BatchRead): result is { closed: true } {
  return "closed" in result && result.closed;
}

const RETRY_WINDOW_MS = 10_000;
const RETRY_INTERVAL_MS = 2_000;

export type BatchDriver = {
  open(id: string): Promise<"complete" | "closed" | "unready">;
  read(): Promise<BatchRead>;
  save(capture: RawCapture): Promise<"stored" | "skipped" | "failed">;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export async function runBatch(options: {
  state: BatchState;
  driver: BatchDriver;
  cancelled: () => boolean;
  onUpdate: (state: BatchState) => void;
}): Promise<BatchState> {
  let state = options.state;
  while (state.phase === "running") {
    if (options.cancelled()) return stop(state, options.onUpdate);
    const id = nextBatchId(state);
    if (!id) return publish({ ...state, phase: "done" }, options.onUpdate);

    const opened = await options.driver.open(id);
    if (options.cancelled()) return stop(state, options.onUpdate);
    if (opened === "closed") return publish({ ...state, phase: "paused" }, options.onUpdate);
    if (opened === "unready") {
      state = noteBatchResult(state, "failed");
      options.onUpdate(state);
      continue;
    }

    const read = await readReady(options.driver, options.cancelled);
    if (read === "cancelled") return stop(state, options.onUpdate);
    if (read === "closed") return publish({ ...state, phase: "paused" }, options.onUpdate);

    let outcome: BatchOutcome;
    if (!read.ok) {
      outcome = read.code === "unrecognized_structure" ? "unrecognized" : "failed";
    } else {
      try {
        outcome = await options.driver.save(read.capture);
      } catch {
        outcome = "failed";
      }
    }
    state = noteBatchResult(state, outcome);
    options.onUpdate(state);
  }
  return state;
}

async function readReady(
  driver: BatchDriver,
  cancelled: () => boolean,
): Promise<ParseResult | "cancelled" | "closed"> {
  const started = driver.now();
  while (true) {
    if (cancelled()) return "cancelled";
    let result: BatchRead;
    try {
      result = await driver.read();
    } catch {
      return { ok: false, code: "not_ready" };
    }
    if (isClosedRead(result)) return "closed";
    if (result.ok || result.code !== "not_ready") return result;
    if (driver.now() - started >= RETRY_WINDOW_MS) return result;
    const remaining = RETRY_WINDOW_MS - (driver.now() - started);
    await driver.sleep(Math.min(RETRY_INTERVAL_MS, remaining));
  }
}

function stop(state: BatchState, onUpdate: (state: BatchState) => void): BatchState {
  return publish(cancelBatch(state), onUpdate);
}

function publish(state: BatchState, onUpdate: (state: BatchState) => void): BatchState {
  onUpdate(state);
  return state;
}
