import { describe, expect, it } from "vitest";
import { classifyPage } from "../../src/capture/page";

describe("classifyPage", () => {
  it.each([
    [
      "https://copilot.cloud.microsoft/chat/conversation/cb180fdb?redirfrom=cosmicRingCookie#top",
      { provider: "copilot", sourceKind: "conversation", pathId: "cb180fdb" },
    ],
    [
      "https://copilot.cloud.microsoft/chat/share/share-token",
      { provider: "copilot", sourceKind: "shared", pathId: "share-token" },
    ],
    [
      "https://chatgpt.com/c/694983bf-3714#reply",
      { provider: "chatgpt", sourceKind: "conversation", pathId: "694983bf-3714" },
    ],
    [
      "https://chatgpt.com/share/share-id?query=1",
      { provider: "chatgpt", sourceKind: "shared", pathId: "share-id" },
    ],
  ] as const)("accepts %s", (url, match) => {
    expect(classifyPage(url)).toEqual(match);
  });

  it.each([
    "http://chatgpt.com/c/one",
    "https://www.chatgpt.com/c/one",
    "https://copilot.microsoft.com/chat/conversation/one",
    "https://chatgpt.com/",
    "https://chatgpt.com/c",
    "https://chatgpt.com/c/",
    "https://chatgpt.com/c/one/more",
    "https://copilot.cloud.microsoft/chat/conversation/",
    "https://copilot.cloud.microsoft/chat",
    "https://example.com/c/one",
    "not a url",
  ])("rejects %s", (url) => {
    expect(classifyPage(url)).toBeNull();
  });
});
