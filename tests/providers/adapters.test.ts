import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseChatgpt, parserVersion as chatgptVersion } from "../../src/providers/chatgpt/adapter";
import { parse as parseCopilot, parserVersion as copilotVersion } from "../../src/providers/copilot/adapter";

describe("provider adapters", () => {
  it("does not treat an allowed page as a captured conversation", () => {
    const page = document.implementation.createHTMLDocument("ChatGPT");

    expect(copilotVersion).toBe("copilot-2");
    expect(chatgptVersion).toBe("chatgpt-4");
    expect(parseCopilot(page, "https://copilot.cloud.microsoft/chat/share/token")).toEqual({
      ok: false,
      code: "unrecognized_structure",
    });
    expect(parseChatgpt(page, "https://chatgpt.com/c/one")).toEqual({
      ok: false,
      code: "unrecognized_structure",
    });
    expect(parseCopilot(page, "https://chatgpt.com/c/one")).toEqual({
      ok: false,
      code: "unsupported_page",
    });
    expect(parseChatgpt(page, "https://example.com/")).toEqual({
      ok: false,
      code: "unsupported_page",
    });
  });

  it("keeps provider and domain imports inside their boundaries", () => {
    const domain = [
      "src/domain/types.ts",
      "src/domain/normalize.ts",
      "src/domain/hash.ts",
      "src/domain/title.ts",
      "src/domain/thoughtPath.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const providers = [
      "src/providers/copilot/adapter.ts",
      "src/providers/chatgpt/adapter.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(domain).not.toMatch(/from ["'](react|react-dom|dexie|wxt)/);
    expect(providers).not.toMatch(/from ["'](react|react-dom|dexie)/);
  });
});
