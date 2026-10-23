import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/providers/copilot/adapter";
import {
  pagePath,
  retainHydrationScript,
  selectHydrationScript,
} from "../../src/providers/copilot/hydration";

const conversationUrl = "https://copilot.cloud.microsoft/chat/conversation/conv-1";
const shareUrl = "https://copilot.cloud.microsoft/chat/share/share-token";
const conversationPath = pagePath(conversationUrl);

function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), "tests/fixtures/copilot", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

function scriptText(name: string): string {
  const text = load(name).querySelector("script")?.textContent;
  if (!text) throw new Error(`${name} has no hydration script`);
  return text;
}

describe("copilot adapter", () => {
  it("reads the normal conversation from chat-history and ignores the chat loader", () => {
    const result = parse(load("conversation.html"), conversationUrl);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        provider: "copilot",
        sourceUrl: conversationUrl,
        sourceId: "conv-1",
        sourceKind: "conversation",
        title: "大豆のおやつ",
        parserVersion: "copilot-2",
        messages: [
          { ordinal: 0, role: "user", content: "作れルンバ", providerMessageId: "m1" },
          { ordinal: 1, role: "assistant", content: "もちろん\n作れる", providerMessageId: "m2" },
          { ordinal: 2, role: "unknown", content: "保留", providerMessageId: "m3" },
        ],
      },
    });
  });

  it("reads a pinned reply from a TextBlock when the message has no text", () => {
    const url = conversationUrl.replace("conv-1", "conv-pinned");
    const result = parse(load("pinned.html"), url);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        sourceId: "conv-pinned",
        parserVersion: "copilot-2",
        messages: [
          { ordinal: 0, role: "user", content: "ピンした問い", providerMessageId: "u1" },
          { ordinal: 1, role: "assistant", content: "一行目\n**強調**した返事", providerMessageId: "b1" },
        ],
      },
    });
  });

  it("keeps the message text when a TextBlock also has different content", () => {
    const url = conversationUrl.replace("conv-1", "conv-text");
    const result = parse(load("text-over-card.html"), url);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        messages: [
          { content: "問い" },
          { content: "本文" },
        ],
      },
    });
  });

  it("reads a shared conversation id from the document instead of the url token", () => {
    const result = parse(load("share.html"), shareUrl);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        sourceId: "conv-share-1",
        sourceKind: "shared",
        title: "共有タイトル",
        messages: [
          { ordinal: 0, role: "user", content: "共有の問い" },
          { ordinal: 1, role: "assistant", content: "共有の答え" },
        ],
      },
    });
  });

  it("uses a retained script only when it belongs to the current conversation path", () => {
    const shell = load("shell.html");
    const retained = scriptText("conversation.html");
    const result = parse(shell, conversationUrl, {
      retainedScriptText: retained,
      retainedPath: conversationPath ?? "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capture.sourceId).toBe("conv-1");
      expect(result.capture.messages[0]?.content).toBe("作れルンバ");
    }
  });

  it("prefers the script still in the document over a retained one", () => {
    const result = parse(load("conversation.html"), conversationUrl, {
      retainedScriptText: scriptText("other-conversation.html"),
      retainedPath: conversationPath ?? "",
    });

    expect(result).toMatchObject({
      ok: true,
      capture: { messages: [{ content: "作れルンバ" }, { content: "もちろん\n作れる" }, { content: "保留" }] },
    });
  });

  it.each([
    ["empty.html", conversationUrl.replace("conv-1", "conv-empty"), "empty_conversation"],
    ["incomplete-count.html", conversationUrl.replace("conv-1", "conv-partial"), "incomplete_conversation"],
    ["shell.html", conversationUrl, "incomplete_conversation"],
    ["unknown-card.html", conversationUrl.replace("conv-1", "conv-unknown-card"), "incomplete_conversation"],
    ["unrecognized.html", conversationUrl, "unrecognized_structure"],
  ] as const)("does not capture %s", (fixture, url, code) => {
    expect(parse(load(fixture), url)).toEqual({ ok: false, code });
  });

  it("drops a retained script for a different conversation", () => {
    const result = parse(load("shell.html"), conversationUrl, {
      retainedScriptText: scriptText("other-conversation.html"),
      retainedPath: conversationPath ?? "",
    });

    expect(result).toEqual({ ok: false, code: "incomplete_conversation" });
  });

  it("waits when the document is still loading and the script has not appeared", () => {
    expect(parse(load("unrecognized.html"), conversationUrl, { documentReady: false })).toEqual({
      ok: false,
      code: "not_ready",
    });
    expect(parse(load("shell.html"), conversationUrl, { documentReady: false })).toEqual({
      ok: false,
      code: "not_ready",
    });
  });

  it("rejects pages outside copilot", () => {
    expect(parse(load("conversation.html"), "https://chatgpt.com/c/conv-1")).toEqual({
      ok: false,
      code: "unsupported_page",
    });
  });
});

describe("copilot hydration retention", () => {
  it("keeps the latest hydration script and ignores unrelated nodes", () => {
    const script = document.createElement("script");
    script.textContent = scriptText("conversation.html");
    const path = conversationPath ?? "";
    const retained = retainHydrationScript(undefined, script, path);
    const div = document.createElement("div");

    expect(retained).toEqual({ text: script.textContent, path });
    expect(retainHydrationScript(retained, div, path)).toBe(retained);
    expect(selectHydrationScript(null, retained, `${conversationUrl}?x=1`)).toBe(script.textContent);
    expect(selectHydrationScript("live script", retained, conversationUrl)).toBe("live script");
    expect(selectHydrationScript(null, retained, shareUrl)).toBeNull();
  });
});
