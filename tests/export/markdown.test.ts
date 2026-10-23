import { describe, expect, it } from "vitest";
import type { Conversation } from "../../src/domain/types";
import { markdownFilename, toMarkdown } from "../../src/export/markdown";

const conversation: Conversation = {
  id: "local-1",
  provider: "copilot",
  sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/c1",
  sourceId: "c1",
  sourceKind: "conversation",
  title: "経路の題",
  capturedAt: "2026-10-23T00:00:00.000Z",
  parserVersion: "copilot-1",
  contentHash: "abc",
  messages: [
    { id: "m2", ordinal: 2, role: "assistant", content: "結論" },
    { id: "m0", ordinal: 0, role: "user", content: "長い脱線\n# 見出し **強調**" },
    { id: "m1", ordinal: 1, role: "unknown", content: "" },
  ],
};

describe("toMarkdown", () => {
  it("writes the full text without escaping markdown", () => {
    expect(toMarkdown(conversation)).toBe(
      [
        "# 経路の題",
        "",
        "- Provider: copilot",
        "- Source: https://copilot.cloud.microsoft/chat/conversation/c1",
        "- Captured: 2026-10-23T00:00:00.000Z",
        "- Parser: copilot-1",
        "",
        "---",
        "",
        "**1. ユーザー**",
        "",
        "長い脱線",
        "# 見出し **強調**",
        "",
        "---",
        "",
        "**2. 不明**",
        "",
        "",
        "",
        "---",
        "",
        "**3. Copilot**",
        "",
        "結論",
        "",
      ].join("\n"),
    );
    expect(toMarkdown(conversation).endsWith("\n")).toBe(true);
    expect(toMarkdown(conversation).includes("\r")).toBe(false);
  });

  it("names a ChatGPT assistant and keeps an empty captured time", () => {
    const text = toMarkdown({
      ...conversation,
      provider: "chatgpt",
      capturedAt: "",
      messages: [{ id: "m0", ordinal: 4, role: "assistant", content: "答え" }],
    });
    expect(text).toContain("- Captured: \n");
    expect(text).toContain("**5. ChatGPT**\n\n答え\n");
  });
});

describe("markdownFilename", () => {
  it("uses the title and falls back when the title is empty", () => {
    expect(markdownFilename("経路の題")).toBe("経路の題.md");
    expect(markdownFilename('a/b:c*?"<>|\u0000')).toBe("abc.md");
    expect(markdownFilename("   ")).toBe("trailogue.md");
  });
});
