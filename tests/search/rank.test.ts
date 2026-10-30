import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  InvalidVectorError,
  rankSemanticMatches,
  semanticLocationKey,
  type SemanticCandidate,
} from "../../src/search/rank";

describe("semantic ranking", () => {
  it("orders by cosine similarity without returning a score or vector", () => {
    const matches = rankSemanticMatches(
      [1, 0],
      [candidate("far", [0, 1]), candidate("near", [0.9, 0.1])],
    );

    expect(matches.map((match) => match.messageId)).toEqual(["near", "far"]);
    expect(matches[0]).not.toHaveProperty("vector");
    expect(matches[0]).not.toHaveProperty("similarity");
  });

  it("excludes exact locations, removes duplicates, and limits results", () => {
    const excluded = new Set([semanticLocationKey("a".repeat(64), "exact")]);
    const matches = rankSemanticMatches(
      [1, 0],
      [candidate("exact", [1, 0]), candidate("kept", [0.9, 0.1]), candidate("kept", [0.8, 0.2])],
      excluded,
      1,
    );
    expect(matches.map((match) => match.messageId)).toEqual(["kept"]);
    expect(
      rankSemanticMatches(
        [1, 0],
        Array.from({ length: 25 }, (_, index) => candidate(`m${index}`, [1, index / 100])),
      ),
    ).toHaveLength(20);
  });

  it("uses capture, conversation, and ordinal only to stabilize equal scores", () => {
    const late = candidate("late", [1, 0], { capturedAt: "2026-02-01T00:00:00.000Z" });
    const second = candidate("second", [1, 0], { ordinal: 2 });
    const first = candidate("first", [1, 0], { ordinal: 1 });
    expect(rankSemanticMatches([1, 0], [late, second, first]).map((match) => match.messageId)).toEqual([
      "first",
      "second",
      "late",
    ]);
  });

  it("rejects invalid, zero, and mismatched vectors", () => {
    expect(() => cosineSimilarity([], [])).toThrow(InvalidVectorError);
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow(InvalidVectorError);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(InvalidVectorError);
    expect(() => cosineSimilarity([Number.NaN], [1])).toThrow(InvalidVectorError);
  });
});

function candidate(
  messageId: string,
  vector: number[],
  overrides: Partial<SemanticCandidate> = {},
): SemanticCandidate {
  return {
    conversationId: "conversation",
    messageId,
    ordinal: 0,
    role: "user",
    content: messageId,
    title: "題",
    provider: "chatgpt",
    capturedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "a".repeat(64),
    vector,
    ...overrides,
  };
}
