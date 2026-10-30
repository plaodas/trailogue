import { describe, expect, it } from "vitest";
import type { Conversation } from "../../src/domain/types";
import {
  emptySemanticIndex,
  parseSemanticIndex,
  reconcileSemanticIndex,
  semanticDocuments,
  serializeSemanticIndex,
  type SemanticIndex,
} from "../../src/search/semanticIndex";

describe("semantic index", () => {
  it("derives one document per non-empty message without changing content", () => {
    const conversation = record();
    const before = JSON.stringify(conversation);
    const documents = semanticDocuments([conversation]);
    expect(documents.map((document) => [document.messageId, document.role, document.content])).toEqual([
      ["u", "user", "問い"],
      ["a", "assistant", "返答"],
    ]);
    expect(JSON.stringify(conversation)).toBe(before);
  });

  it("keeps valid rows, prunes absent originals, and reports missing messages", () => {
    const documents = semanticDocuments([record()]);
    const index: SemanticIndex = {
      version: 1,
      model: "model",
      dimensions: 2,
      entries: [
        { ...location("u", 0, "user"), vector: [1, 0] },
        { ...location("gone", 9, "assistant"), vector: [0, 1] },
      ],
    };
    const result = reconcileSemanticIndex(index, "model", documents);
    expect(result.index.entries.map((entry) => entry.messageId)).toEqual(["u"]);
    expect(result.missing.map((document) => document.messageId)).toEqual(["a"]);
    expect(result.changed).toBe(true);
  });

  it("rebuilds for another model and rejects a corrupt cache", () => {
    const documents = semanticDocuments([record()]);
    const result = reconcileSemanticIndex(emptySemanticIndex("old"), "new", documents);
    expect(result.index.model).toBe("new");
    expect(result.missing).toHaveLength(2);
    expect(parseSemanticIndex("{")).toBeUndefined();
    expect(parseSemanticIndex('{"version":1,"model":"m","dimensions":2,"entries":[]}')).toBeUndefined();
  });

  it("round trips an index without storing message content", () => {
    const index: SemanticIndex = {
      version: 1,
      model: "model",
      dimensions: 2,
      entries: [{ ...location("u", 0, "user"), vector: [1, 0] }],
    };
    const text = serializeSemanticIndex(index);
    expect(text).not.toContain("問い");
    expect(parseSemanticIndex(text)).toEqual(index);
  });
});

function record(): Conversation {
  return {
    id: "conversation",
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/example",
    sourceId: "example",
    sourceKind: "conversation",
    title: "題",
    capturedAt: "2026-01-01T00:00:00.000Z",
    parserVersion: "test",
    contentHash: "a".repeat(64),
    messages: [
      { id: "u", ordinal: 0, role: "user", content: "問い" },
      { id: "a", ordinal: 1, role: "assistant", content: "返答" },
      { id: "empty", ordinal: 2, role: "unknown", content: "" },
    ],
  };
}

function location(messageId: string, ordinal: number, role: "user" | "assistant") {
  return {
    contentHash: "a".repeat(64),
    conversationId: "conversation",
    messageId,
    ordinal,
    role,
  } as const;
}
