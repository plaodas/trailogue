import { describe, expect, it } from "vitest";
import { serializeConversation } from "../../src/archive/conversationFile";
import {
  coversOnDay,
  daysInMonth,
  groupCovers,
  latestDay,
  localDay,
  monthsDescending,
  openedCovers,
  reunionCover,
  unopenedCovers,
  type DeskRecord,
} from "../../src/desk/album";
import { parseOpenedMarks, readDeskFiles } from "../../src/desk/files";
import { normalize } from "../../src/domain/normalize";
import type { Conversation, RawCapture } from "../../src/domain/types";

const TOKYO = "Asia/Tokyo";

describe("desk album", () => {
  it("folds a utc evening into the local next day", () => {
    expect(localDay("2026-10-24T15:00:00.000Z", TOKYO)).toBe("2026-10-25");
    expect(localDay("2026-10-24T14:59:00.000Z", TOKYO)).toBe("2026-10-24");
  });

  it("keeps generations as rings on one cover dated by the latest capture", () => {
    const covers = groupCovers(
      [
        record({ id: "early", capturedAt: "2026-10-24T01:00:00.000Z", title: "初め" }),
        record({ id: "late", capturedAt: "2026-10-24T15:00:00.000Z", title: "あと" }),
      ],
      TOKYO,
    );

    expect(covers).toHaveLength(1);
    expect(covers[0]?.title).toBe("あと");
    expect(covers[0]?.day).toBe("2026-10-25");
    expect(covers[0]?.rings.map((ring) => ring.title)).toEqual(["初め", "あと"]);
    expect(covers[0]?.rings.map((ring) => ring.parserVersion)).toEqual(["copilot-1", "copilot-1"]);
  });

  it("orders one day by capture time and finds the latest day", () => {
    const covers = groupCovers(
      [
        record({ id: "b", sourceId: "b", capturedAt: "2026-10-01T02:00:00.000Z" }),
        record({ id: "a", sourceId: "a", capturedAt: "2026-10-01T01:00:00.000Z" }),
        record({ id: "c", sourceId: "c", capturedAt: "2026-11-02T00:00:00.000Z" }),
      ],
      "UTC",
    );

    expect(latestDay(covers)).toBe("2026-11-02");
    expect(coversOnDay(covers, "2026-10-01").map((cover) => cover.sourceId)).toEqual(["a", "b"]);
    expect(monthsDescending(covers)).toEqual(["2026-11", "2026-10"]);
    expect(daysInMonth(covers, "2026-10")).toEqual(["2026-10-01"]);
  });

  it("puts the longest-left opened cover first and leaves the never opened aside", () => {
    const covers = groupCovers(
      [
        record({ id: "old", sourceId: "old", hash: "a".repeat(64), capturedAt: "2026-01-01T00:00:00.000Z" }),
        record({ id: "new", sourceId: "new", hash: "b".repeat(64), capturedAt: "2026-02-01T00:00:00.000Z" }),
        record({ id: "shut", sourceId: "shut", hash: "c".repeat(64), capturedAt: "2026-03-01T00:00:00.000Z" }),
      ],
      "UTC",
    );
    const opened = { ["a".repeat(64)]: "2026-04-01T00:00:00.000Z", ["b".repeat(64)]: "2026-05-01T00:00:00.000Z" };

    expect(reunionCover(covers, opened)?.sourceId).toBe("old");
    expect(openedCovers(covers, opened).map((cover) => cover.sourceId)).toEqual(["old", "new"]);
    expect(unopenedCovers(covers, opened).map((cover) => cover.sourceId)).toEqual(["shut"]);
    expect(reunionCover(covers, {})).toBeNull();
  });
});

describe("desk files", () => {
  it("reads verified hash names and skips other files", async () => {
    const conversation = await sample();
    const name = `${conversation.contentHash}.json`;
    const listing = await readDeskFiles([
      { name, text: serializeConversation(conversation) },
      { name: "notes.json", text: "{}" },
      { name: `${"d".repeat(64)}.json`, text: "{" },
    ]);

    expect(listing.unreadable).toBe(1);
    expect(listing.records.map((record) => record.id)).toEqual([conversation.id]);
    expect(listing.records[0]?.messageCount).toBe(2);
  });

  it("keeps only hash marks from the opened file", () => {
    expect(parseOpenedMarks(`{"${"a".repeat(64)}":"2026-01-01T00:00:00.000Z","notes":"x"}`)).toEqual({
      ["a".repeat(64)]: "2026-01-01T00:00:00.000Z",
    });
    expect(parseOpenedMarks("{")).toEqual({});
  });
});

function record(input: {
  id: string;
  sourceId?: string;
  capturedAt: string;
  title?: string;
  hash?: string;
}): DeskRecord {
  return {
    id: input.id,
    sourceId: input.sourceId ?? "same",
    provider: "copilot",
    title: input.title ?? input.id,
    capturedAt: input.capturedAt,
    contentHash: input.hash ?? `${input.id.padEnd(64, "0")}`,
    messageCount: 1,
    parserVersion: "copilot-1",
  };
}

function sample(): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-1",
    messages: [
      { ordinal: 0, role: "user", content: "問い", providerMessageId: "u" },
      { ordinal: 1, role: "assistant", content: "返答", providerMessageId: "a" },
    ],
  };
  return normalize(raw, { id: "record-1", capturedAt: "2026-01-01T00:00:00.000Z" });
}
