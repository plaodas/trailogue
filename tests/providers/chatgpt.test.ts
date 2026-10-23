import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/providers/chatgpt/adapter";

const shareUrl = "https://chatgpt.com/share/share-1";
const conversationUrl = "https://chatgpt.com/c/conv-1";

function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), "tests/fixtures/chatgpt", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("chatgpt adapter", () => {
  it("reads a shared conversation from __WEB_MOBILE_DATA__ and ignores the rendered text", () => {
    const result = parse(load("share.html"), shareUrl);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        provider: "chatgpt",
        sourceUrl: shareUrl,
        sourceId: "share-1",
        sourceKind: "shared",
        title: "理由の設定",
        parserVersion: "chatgpt-1",
        messages: [
          { ordinal: 0, role: "user", content: "問い", providerMessageId: "u1" },
          { ordinal: 1, role: "assistant", content: "答え\n続き", providerMessageId: "a1" },
          { ordinal: 2, role: "unknown", content: "注", providerMessageId: "t1" },
        ],
      },
    });
    if (result.ok) {
      expect(result.capture.messages.some((message) => message.content.includes("DOMだけ"))).toBe(false);
    }
  });

  it("reads a normal conversation from the confirmed message DOM", () => {
    const result = parse(load("conversation.html"), conversationUrl);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        sourceId: "conv-1",
        sourceKind: "conversation",
        title: "理由の設定",
        messages: [
          { ordinal: 0, role: "user", content: "問いその一", providerMessageId: "user-1" },
          { ordinal: 1, role: "assistant", content: "答えその一", providerMessageId: "asst-1" },
        ],
      },
    });
    if (result.ok) {
      expect(result.capture.messages.some((message) => message.content.includes("コピー"))).toBe(false);
    }
  });

  it.each([
    ["empty.html", shareUrl, "empty_conversation"],
    ["incomplete-count.html", shareUrl, "incomplete_conversation"],
    ["virtualized.html", conversationUrl, "incomplete_conversation"],
    ["unrecognized.html", conversationUrl, "unrecognized_structure"],
    ["unrecognized.html", shareUrl, "unrecognized_structure"],
  ] as const)("does not capture %s", (fixture, url, code) => {
    expect(parse(load(fixture), url)).toEqual({ ok: false, code });
  });

  it("waits while a conversation document is still loading", () => {
    expect(parse(load("unrecognized.html"), conversationUrl, { documentReady: false })).toEqual({
      ok: false,
      code: "not_ready",
    });
    expect(parse(load("unrecognized.html"), shareUrl, { documentReady: false })).toEqual({
      ok: false,
      code: "not_ready",
    });
  });

  it("rejects pages outside chatgpt", () => {
    expect(parse(load("share.html"), "https://copilot.cloud.microsoft/chat/share/share-1")).toEqual({
      ok: false,
      code: "unsupported_page",
    });
  });
});
