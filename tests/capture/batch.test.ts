import { describe, expect, it } from "vitest";
import { resumeBatch, startBatch } from "../../src/capture/batch";
import { runBatch, type BatchDriver } from "../../src/capture/runBatch";
import type { SidebarConversation } from "../../src/capture/sidebar";
import type { RawCapture } from "../../src/domain/types";

const capture: RawCapture = {
  provider: "copilot",
  sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/one",
  sourceId: "one",
  sourceKind: "conversation",
  title: "題",
  parserVersion: "copilot-2",
  messages: [{ ordinal: 0, role: "user", content: "本文" }],
};

describe("runBatch", () => {
  it("pauses after three unrecognized pages and resumes only the remainder", async () => {
    const opened: string[] = [];
    const first = await runBatch({
      state: startBatch(named("a", "b", "c", "d", "e")),
      cancelled: () => false,
      onUpdate: () => {},
      driver: driver({
        open: async (id) => {
          opened.push(id);
          return "complete";
        },
        read: async () => ({ ok: false, code: "unrecognized_structure" }),
      }),
    });

    expect(first.phase).toBe("paused");
    expect(first.cursor).toBe(3);
    expect(first.failed).toBe(3);
    expect(first.failures).toEqual(named("a", "b", "c"));
    expect(opened).toEqual(["a", "b", "c"]);

    const rest: string[] = [];
    const second = await runBatch({
      state: resumeBatch(first),
      cancelled: () => false,
      onUpdate: () => {},
      driver: driver({
        open: async (id) => {
          rest.push(id);
          return "complete";
        },
        read: async () => ({ ok: true, capture }),
        save: async () => "stored",
      }),
    });

    expect(rest).toEqual(["d", "e"]);
    expect(second.phase).toBe("done");
    expect(second.stored).toBe(2);
  });

  it("resets the unrecognized streak when another result arrives", async () => {
    const state = await runBatch({
      state: startBatch(named("a", "b", "c", "d")),
      cancelled: () => false,
      onUpdate: () => {},
      driver: driver({
        read: async () => {
          const reads = ++readCount;
          if (reads === 2) return { ok: false, code: "empty_conversation" };
          return { ok: false, code: "unrecognized_structure" };
        },
      }),
    });

    expect(state.phase).toBe("done");
    expect(state.cursor).toBe(4);
    expect(state.unrecognizedStreak).toBe(2);
    expect(state.failures).toEqual(named("a", "b", "c", "d"));
  });

  it("does not open the next conversation after cancellation", async () => {
    const opened: string[] = [];
    let release: (result: "complete") => void = () => {};
    let stop = false;
    const finished = runBatch({
      state: startBatch(named("a", "b")),
      cancelled: () => stop,
      onUpdate: () => {},
      driver: driver({
        open: (id) => {
          opened.push(id);
          stop = true;
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      }),
    });
    release("complete");
    await finished;

    expect(opened).toEqual(["a"]);
  });

  it("waits through not_ready and then stores the conversation", async () => {
    let clock = 0;
    let reads = 0;
    const state = await runBatch({
      state: startBatch(named("a")),
      cancelled: () => false,
      onUpdate: () => {},
      driver: driver({
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        read: async () => {
          reads += 1;
          if (clock < 10_000) return { ok: false, code: "not_ready" };
          return { ok: true, capture };
        },
        save: async () => "stored",
      }),
    });

    expect(reads).toBeGreaterThan(1);
    expect(state).toMatchObject({ phase: "done", stored: 1, failed: 0 });
  });
});

function named(...ids: string[]): SidebarConversation[] {
  return ids.map((id) => ({ id, title: id }));
}

let readCount = 0;

function driver(overrides: Partial<BatchDriver>): BatchDriver {
  readCount = 0;
  return {
    open: async () => "complete",
    read: async () => ({ ok: false, code: "unrecognized_structure" }),
    save: async () => "failed",
    sleep: async () => {},
    now: () => 0,
    ...overrides,
  };
}
