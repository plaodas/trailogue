import { describe, expect, it, vi } from "vitest";
import { messageFingerprints } from "../../src/domain/importStatus";
import type { ParseResult, RawCapture } from "../../src/domain/types";
import {
  IMPORT_RETRY_INTERVAL_MS,
  IMPORT_RETRY_WINDOW_MS,
  createImportWatcher,
  readImportReport,
  type ImportWatchReport,
} from "../../src/capture/importWatch";

const PAGE = "https://chatgpt.com/c/conversation-1";

describe("readImportReport", () => {
  it("sends fingerprints without the message text", async () => {
    const report = await readImportReport(PAGE, () => ({ ok: true, capture: capture() }));

    expect(report).toEqual({
      type: "trailogue:import-watch",
      kind: "ready",
      provider: "chatgpt",
      sourceId: "conversation-1",
      fingerprints: await messageFingerprints([{ role: "user", content: "問\nい" }]),
    });
    expect(JSON.stringify(report)).not.toContain("問い");
  });

  it("keeps an unfinished page pending and any other failure unavailable", async () => {
    expect((await readImportReport(PAGE, () => failure("not_ready"))).kind).toBe("pending");
    expect((await readImportReport(PAGE, () => failure("incomplete_conversation"))).kind).toBe("unavailable");
    expect((await readImportReport(PAGE, () => failure("empty_conversation"))).kind).toBe("unavailable");
    expect((await readImportReport(PAGE, () => failure("unrecognized_structure"))).kind).toBe("unavailable");
    expect((await readImportReport(PAGE, () => failure("login_required"))).kind).toBe("unavailable");
  });

  it("clears a page that is not a conversation without parsing it", async () => {
    const parse = vi.fn((): ParseResult => ({ ok: true, capture: capture() }));
    expect(await readImportReport("https://chatgpt.com/", parse)).toEqual({
      type: "trailogue:import-watch",
      kind: "clear",
    });
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("createImportWatcher", () => {
  it("rereads a waiting page for about ten seconds and then stays pending", async () => {
    const sent: ImportWatchReport[] = [];
    const clock = fakeClock();
    let reads = 0;
    const watcher = createImportWatcher({
      href: () => PAGE,
      read: async () => {
        reads += 1;
        return { type: "trailogue:import-watch", kind: "pending" };
      },
      send: (report) => { sent.push(report); },
      now: () => clock.now,
      schedule: clock.schedule,
    });

    watcher.refresh();
    await clock.drain(IMPORT_RETRY_WINDOW_MS);

    expect(sent.every((report) => report.kind === "pending")).toBe(true);
    expect(reads).toBe(IMPORT_RETRY_WINDOW_MS / IMPORT_RETRY_INTERVAL_MS);
    expect(clock.pending()).toBe(0);
  });

  it("stops rereading once the page can be compared", async () => {
    const sent: ImportWatchReport["kind"][] = [];
    const clock = fakeClock();
    let reads = 0;
    const watcher = createImportWatcher({
      href: () => PAGE,
      read: async () => {
        reads += 1;
        return reads === 1
          ? { type: "trailogue:import-watch", kind: "pending" }
          : {
            type: "trailogue:import-watch",
            kind: "ready",
            provider: "chatgpt",
            sourceId: "conversation-1",
            fingerprints: ["a"],
          };
      },
      send: (report) => { sent.push(report.kind); },
      now: () => clock.now,
      schedule: clock.schedule,
    });

    watcher.refresh();
    await clock.drain(IMPORT_RETRY_WINDOW_MS);

    expect(sent).toEqual(["pending", "ready"]);
    expect(reads).toBe(2);
  });

  it("clears the badge when the tab leaves the conversation", async () => {
    let href = PAGE;
    const sent: ImportWatchReport["kind"][] = [];
    const clock = fakeClock();
    const watcher = createImportWatcher({
      href: () => href,
      read: async () => ({ type: "trailogue:import-watch", kind: "pending" }),
      send: (report) => { sent.push(report.kind); },
      now: () => clock.now,
      schedule: clock.schedule,
    });

    watcher.refresh();
    await settle();
    href = "https://chatgpt.com/";
    watcher.refresh();
    await clock.drain(IMPORT_RETRY_WINDOW_MS);

    expect(sent).toEqual(["pending", "clear"]);
  });
});

function capture(): RawCapture {
  return {
    provider: "chatgpt",
    sourceUrl: PAGE,
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: null,
    parserVersion: "chatgpt-4",
    messages: [{ ordinal: 0, role: "user", content: "  問\r\nい  " }],
  };
}

function failure(code: "not_ready" | "incomplete_conversation" | "empty_conversation" | "unrecognized_structure" | "login_required"): ParseResult {
  return { ok: false, code };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 6; step += 1) await Promise.resolve();
}

function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; run: () => void }> = [];
  return {
    get now() {
      return now;
    },
    schedule(delayMs: number, run: () => void) {
      const timer = { at: now + delayMs, run };
      timers.push(timer);
      return () => {
        timer.run = () => undefined;
      };
    },
    pending() {
      return timers.filter((timer) => timer.at > now).length;
    },
    async drain(until: number) {
      await settle();
      while (timers.length > 0 && timers[0] !== undefined && timers[0].at <= until) {
        const next = timers.shift();
        if (!next) break;
        now = next.at;
        next.run();
        await settle();
      }
    },
  };
}
