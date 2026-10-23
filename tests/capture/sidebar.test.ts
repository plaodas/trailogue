import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copilotConversationIds } from "../../src/capture/sidebar";

function load(): Document {
  const html = readFileSync(join(process.cwd(), "tests/fixtures/copilot/sidebar.html"), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("copilotConversationIds", () => {
  it("keeps marked conversation ids in document order", () => {
    expect(copilotConversationIds(load())).toEqual(["first", "second", "third"]);
  });
});
