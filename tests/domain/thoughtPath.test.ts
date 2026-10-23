import { describe, expect, it } from "vitest";
import { deriveThoughtPath } from "../../src/domain/thoughtPath";
import type { Conversation } from "../../src/domain/types";

const conversation: Conversation = {
  id: "local-1",
  provider: "chatgpt",
  sourceUrl: "https://chatgpt.com/c/one",
  sourceId: "one",
  sourceKind: "conversation",
  title: "問い",
  capturedAt: "2026-10-23T00:00:00.000Z",
  parserVersion: "chatgpt-1",
  contentHash: "abc",
  messages: [
    { id: "m0", ordinal: 0, role: "user", content: "長い脱線を含む本文" },
    { id: "m1", ordinal: 1, role: "unknown", content: "" },
    { id: "m2", ordinal: 2, role: "assistant", content: "結論の前の修正" },
  ],
};

describe("deriveThoughtPath", () => {
  it("keeps every message in order without a separate body", () => {
    const path = deriveThoughtPath(conversation);

    expect(path).toEqual([
      { id: "path-m0", ordinal: 0, role: "user", messageId: "m0" },
      { id: "path-m1", ordinal: 1, role: "unknown", messageId: "m1" },
      { id: "path-m2", ordinal: 2, role: "assistant", messageId: "m2" },
    ]);
    expect(path).toHaveLength(conversation.messages.length);
    expect(path.every((node) => !("content" in node))).toBe(true);
  });
});
