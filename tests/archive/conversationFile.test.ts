import { describe, expect, it } from "vitest";
import {
  conversationFileName,
  listConversationFiles,
  readConversationFile,
  serializeConversation,
  writeConversationFile,
  type ArchiveDirectory,
} from "../../src/archive/conversationFile";
import { normalize } from "../../src/domain/normalize";
import type { Conversation, RawCapture } from "../../src/domain/types";

describe("conversation files", () => {
  it("reads a verified file back as the same conversation", async () => {
    const conversation = await sample();
    const text = serializeConversation(conversation);

    expect(conversationFileName(conversation.contentHash)).toBe(`${conversation.contentHash}.json`);
    expect(await readConversationFile(text)).toEqual(conversation);
  });

  it("rejects a file whose body no longer matches the hash", async () => {
    const conversation = await sample();
    const parsed = JSON.parse(serializeConversation(conversation)) as Conversation;
    const message = parsed.messages[0];
    if (!message) throw new Error("missing message");
    parsed.messages[0] = { ...message, content: "変えた本文" };

    expect(await readConversationFile(JSON.stringify(parsed))).toBeNull();
  });

  it("leaves a valid file in place and replaces only a corrupt one", async () => {
    const conversation = await sample();
    const directory = memoryDirectory();
    await writeConversationFile(directory, conversation);
    const name = conversationFileName(conversation.contentHash);
    const original = await directory.read(name);

    await writeConversationFile(directory, { ...conversation, title: "別の題" });
    expect(await directory.read(name)).toBe(original);
    expect(directory.writes).toBe(1);

    await directory.write(name, "{");
    await writeConversationFile(directory, conversation);
    expect(directory.writes).toBe(3);
    expect(await readConversationFile((await directory.read(name)) ?? "")).toEqual(conversation);
  });

  it("counts json that does not verify and keeps the valid records", async () => {
    const conversation = await sample();
    const directory = memoryDirectory();
    await writeConversationFile(directory, conversation);
    await directory.write("notes.json", "{}");
    await directory.write("other.json", serializeConversation(conversation));

    const listing = await listConversationFiles(directory);
    expect(listing.unreadable).toBe(2);
    expect(listing.conversations).toEqual([conversation]);
  });
});

function memoryDirectory(): ArchiveDirectory & { writes: number } {
  const files = new Map<string, string>();
  const directory = {
    writes: 0,
    async read(name: string) {
      return files.get(name) ?? null;
    },
    async write(name: string, contents: string) {
      directory.writes += 1;
      files.set(name, contents);
    },
    async list() {
      return [...files].map(([name, text]) => ({ name, text }));
    },
  };
  return directory;
}

function sample(): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-1",
    messages: [
      { ordinal: 0, role: "user", content: "初めの問い", providerMessageId: "u" },
      { ordinal: 1, role: "assistant", content: "返答", providerMessageId: "a" },
    ],
  };
  return normalize(raw, { id: "record-1", capturedAt: "2026-01-01T00:00:00.000Z" });
}
