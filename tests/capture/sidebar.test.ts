import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chatgptConversationIds, copilotConversationIds } from "../../src/capture/sidebar";

function load(provider: "copilot" | "chatgpt"): Document {
  const html = readFileSync(join(process.cwd(), "tests/fixtures", provider, "sidebar.html"), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("copilotConversationIds", () => {
  it("keeps marked conversation ids in document order", () => {
    expect(copilotConversationIds(load("copilot"))).toEqual(["first", "second", "third"]);
  });
});

describe("chatgptConversationIds", () => {
  it("keeps keyed conversation ids in document order", () => {
    expect(chatgptConversationIds(load("chatgpt"))).toEqual(["first", "second", "third"]);
  });
});
