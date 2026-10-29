import { describe, expect, it } from "vitest";
import { groupRecords, relateGroups } from "../../src/domain/sourceGroups";
import type { Conversation, MessageRole } from "../../src/domain/types";

describe("source groups", () => {
  it("orders bundles by the newest capture and members from oldest to newest", () => {
    const groups = groupRecords([
      conversation("a1", "a", "2026-01-01T00:00:00.000Z", [{ role: "user", content: "先" }]),
      conversation("b1", "b", "2026-03-01T00:00:00.000Z", [{ role: "user", content: "別" }]),
      conversation("a2", "a", "2026-02-01T00:00:00.000Z", [{ role: "user", content: "あと" }]),
    ]);

    expect(groups.map((group) => group.sourceId)).toEqual(["b", "a"]);
    expect(groups[1]?.records.map((record) => record.conversation.id)).toEqual(["a1", "a2"]);
  });

  it("labels each generation against the others in the same bundle", async () => {
    const groups = await relateGroups(groupRecords([
      conversation("short", "same", "2026-01-01T00:00:00.000Z", [
        { role: "user", content: "問い" },
        { role: "assistant", content: "初め" },
      ], "chatgpt-4"),
      conversation("whole", "same", "2026-02-01T00:00:00.000Z", [
        { role: "user", content: "問い" },
        { role: "assistant", content: "初め" },
        { role: "user", content: "続き" },
        { role: "assistant", content: "あと" },
      ], "chatgpt-export-1"),
      conversation("window", "same", "2026-03-01T00:00:00.000Z", [
        { role: "user", content: "続き" },
        { role: "assistant", content: "あと" },
      ], "chatgpt-4"),
      conversation("other", "same", "2026-04-01T00:00:00.000Z", [
        { role: "user", content: "別の問い" },
      ], "chatgpt-4"),
    ]));

    expect(groups[0]?.records.map((record) => [record.conversation.id, record.relation])).toEqual([
      ["short", "shortened"],
      ["whole", "extended"],
      ["window", "window"],
      ["other", "diverged"],
    ]);
  });
});

function conversation(
  id: string,
  sourceId: string,
  capturedAt: string,
  messages: { role: MessageRole; content: string }[],
  parserVersion = "chatgpt-4",
): Conversation {
  return {
    id,
    provider: "chatgpt",
    sourceUrl: `https://chatgpt.com/c/${sourceId}`,
    sourceId,
    sourceKind: "conversation",
    title: id,
    capturedAt,
    parserVersion,
    contentHash: id.padEnd(64, "0"),
    messages: messages.map((message, ordinal) => ({
      id: `${id}-${ordinal}`,
      ordinal,
      role: message.role,
      content: message.content,
    })),
  };
}
