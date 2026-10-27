import { describe, expect, it } from "vitest";
import { findTextMatches, markQuery, matchingLines } from "../../src/search/text";
import type { Conversation, Message } from "../../src/domain/types";

describe("text search", () => {
  it("returns nothing for an empty or blank query", () => {
    const conversation = record("early", "2026-01-01T00:00:00.000Z", [message("m1", 0, "軌跡")]);
    expect(findTextMatches([conversation], "")).toEqual([]);
    expect(findTextMatches([conversation], "   ")).toEqual([]);
    expect(findTextMatches([conversation], "\n")).toEqual([]);
  });

  it("matches the stored string and keeps case", () => {
    const conversation = record("early", "2026-01-01T00:00:00.000Z", [message("m1", 0, "Hello 軌跡")]);
    expect(findTextMatches([conversation], "hello")).toEqual([]);
    expect(findTextMatches([conversation], "Hello").map((match) => match.messageId)).toEqual(["m1"]);
  });

  it("orders generations by capture time and ordinal without changing the body", () => {
    const body = "前置き\nここに軌跡がある 残り";
    const early = record("a-gen", "2026-01-01T00:00:00.000Z", [
      message("skip", 0, "別の話"),
      message("hit-late", 2, "末尾の軌跡"),
      message("hit-early", 1, body),
    ]);
    const later = record("b-gen", "2026-06-01T00:00:00.000Z", [message("later", 0, "翌年の軌跡")]);
    const sameTime = record("c-gen", "2026-01-01T00:00:00.000Z", [message("tied", 0, "同時の軌跡")]);

    const matches = findTextMatches([later, sameTime, early], "軌跡");

    expect(matches.map((match) => match.messageId)).toEqual(["hit-early", "hit-late", "tied", "later"]);
    expect(early.messages.find((item) => item.id === "hit-early")?.content).toBe(body);
    expect(matches[0]?.content).toBe(body);
    expect(matches[0]?.title).toBe("題");
  });

  it("does not match a title that is absent from the body", () => {
    const conversation = record("early", "2026-01-01T00:00:00.000Z", [message("m1", 0, "本文")]);
    conversation.title = "軌跡という題";
    expect(findTextMatches([conversation], "軌跡")).toEqual([]);
  });

  it("keeps each matching line whole, including a match that crosses a break", () => {
    expect(matchingLines("前\n一致を含む一行の残り\n後", "一致")).toEqual(["一致を含む一行の残り"]);
    expect(matchingLines("keep one\ntwo stay\nno", "one\ntwo")).toEqual(["keep one", "two stay"]);
    expect(matchingLines("軌跡", "")).toEqual([]);
  });

  it("rejoins marks into the original text", () => {
    const text = "aa 軌跡 aa\n次の軌跡";
    const spans = markQuery(text, "軌跡");
    expect(spans.map((span) => span.text).join("")).toBe(text);
    expect(spans.filter((span) => span.match).map((span) => span.text)).toEqual(["軌跡", "軌跡"]);
    expect(markQuery("Hello", "hello").map((span) => span.text).join("")).toBe("Hello");
    expect(markQuery("Hello", "hello").every((span) => !span.match)).toBe(true);
    expect(markQuery("", "軌跡")).toEqual([{ text: "", match: false }]);
  });
});

function record(id: string, capturedAt: string, messages: Message[]): Conversation {
  return {
    id,
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/example",
    sourceId: "example",
    sourceKind: "conversation",
    title: "題",
    capturedAt,
    parserVersion: "test",
    contentHash: id.padEnd(64, "0"),
    messages,
  };
}

function message(id: string, ordinal: number, content: string): Message {
  return { id, ordinal, role: "user", content };
}
