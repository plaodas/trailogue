import { describe, expect, it } from "vitest";
import { canonicalContent, contentHash } from "../../src/domain/hash";
import { normalize, normalizeContent } from "../../src/domain/normalize";
import type { RawCapture } from "../../src/domain/types";

const capturedAt = "2026-10-23T00:00:00.000Z";

function raw(overrides: Partial<RawCapture> = {}): RawCapture {
  return {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/one",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "気圧の話",
    parserVersion: "copilot-1",
    messages: [
      { ordinal: 2, role: "assistant", content: " 続き\r\nです ", providerMessageId: "bot-1" },
      { ordinal: 0, role: "user", content: "  初め\rの問い  " },
      { ordinal: 1, role: "unknown", content: "   " },
    ],
    ...overrides,
  };
}

describe("normalize", () => {
  it("reorders messages, keeps blanks, and changes only surrounding whitespace and newlines", async () => {
    const conversation = await normalize(raw(), { id: "local-1", capturedAt });

    expect(conversation.messages.map((message) => message.content)).toEqual([
      "初め\nの問い",
      "",
      "続き\nです",
    ]);
    expect(conversation.messages.map((message) => message.ordinal)).toEqual([0, 1, 2]);
    expect(conversation.messages.map((message) => message.role)).toEqual([
      "user",
      "unknown",
      "assistant",
    ]);
    expect(conversation.messages[2]?.providerMessageId).toBe("bot-1");
    expect(normalizeContent("a  b\n\n c")).toBe("a  b\n\n c");
  });

  it("uses a provider message id and keeps ids unique", async () => {
    const conversation = await normalize(
      raw({
        messages: [
          { ordinal: 0, role: "user", content: "同じ", providerMessageId: "same" },
          { ordinal: 1, role: "assistant", content: "同じ", providerMessageId: "same" },
          { ordinal: 2, role: "user", content: "なし" },
        ],
      }),
      { id: "local-1", capturedAt },
    );

    expect(conversation.messages.map((message) => message.id)).toEqual([
      "same",
      "same-1",
      "ordinal-2",
    ]);
  });

  it("rejects site names and counts title length in code points", async () => {
    const long = `${"あ".repeat(79)}😀尾`;
    const conversation = await normalize(
      raw({
        title: " ChatGPT ",
        messages: [{ ordinal: 0, role: "user", content: long }],
      }),
      { id: "local-1", capturedAt },
    );

    expect(conversation.title).toBe(`${"あ".repeat(79)}😀`);
    expect(Array.from(conversation.title)).toHaveLength(80);
  });

  it("hashes the canonical transcript without url, title, or source kind", async () => {
    const first = await normalize(raw(), { id: "local-1", capturedAt });
    const second = await normalize(
      raw({
        sourceUrl: "https://copilot.cloud.microsoft/chat/share/token",
        sourceKind: "shared",
        title: "別の見出し",
        parserVersion: "copilot-2",
      }),
      { id: "local-2", capturedAt: "2026-10-24T00:00:00.000Z" },
    );
    const changed = await normalize(raw({ sourceId: "conversation-2" }), {
      id: "local-3",
      capturedAt,
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(changed.contentHash).not.toBe(first.contentHash);
    expect(first.id).not.toBe(second.id);
    expect(first.title).not.toBe(second.title);
  });
});

describe("contentHash", () => {
  it("is the sha-256 of the canonical json", async () => {
    const input = {
      provider: "copilot" as const,
      sourceId: "conversation-1",
      messages: [{ ordinal: 0, role: "user" as const, content: "初め\nの問い" }],
    };
    const json = canonicalContent(input);

    expect(json).toBe(
      '{"v":1,"provider":"copilot","sourceId":"conversation-1","messages":[{"ordinal":0,"role":"user","content":"初め\\nの問い"}]}',
    );
    expect(await contentHash(input)).toBe(
      "71dd284db153bd271bb7e0dbca6ff86ba2d3a60563252ae4fa07e87ea8c91424",
    );
  });
});
