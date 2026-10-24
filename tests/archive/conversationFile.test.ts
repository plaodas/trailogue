import { describe, expect, it } from "vitest";
import {
  conversationFileName,
  listConversationFiles,
  readConversationFile,
  removeConversationFile,
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

  it("removes one verified file and leaves another hash", async () => {
    const first = await sample();
    const second = await sample("あとの問い", "record-2");
    const directory = memoryDirectory();
    await writeConversationFile(directory, first);
    await writeConversationFile(directory, second);

    expect(await removeConversationFile(directory, first)).toBe(true);

    expect(await directory.read(conversationFileName(first.contentHash))).toBeNull();
    expect(await readConversationFile((await directory.read(conversationFileName(second.contentHash))) ?? "")).toEqual(
      second,
    );
    expect(directory.removes).toBe(1);
  });

  it("leaves a file that does not verify and a missing file is already gone", async () => {
    const conversation = await sample();
    const directory = memoryDirectory();
    const name = conversationFileName(conversation.contentHash);
    await directory.write(name, "{");
    await directory.write("notes.json", "{}");

    expect(await removeConversationFile(directory, conversation)).toBe(false);
    expect(await directory.read(name)).toBe("{");
    expect(await directory.read("notes.json")).toBe("{}");
    expect(directory.removes).toBe(0);

    const missing = memoryDirectory();
    expect(await removeConversationFile(missing, conversation)).toBe(true);
    expect(missing.removes).toBe(0);
  });
});

function memoryDirectory(): ArchiveDirectory & { writes: number; removes: number } {
  const files = new Map<string, string>();
  const directory = {
    writes: 0,
    removes: 0,
    async read(name: string) {
      return files.get(name) ?? null;
    },
    async write(name: string, contents: string) {
      directory.writes += 1;
      files.set(name, contents);
    },
    async remove(name: string) {
      directory.removes += 1;
      files.delete(name);
    },
    async list() {
      return [...files].map(([name, text]) => ({ name, text }));
    },
  };
  return directory;
}

function sample(content = "初めの問い", id = "record-1"): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-1",
    messages: [
      { ordinal: 0, role: "user", content, providerMessageId: "u" },
      { ordinal: 1, role: "assistant", content: "返答", providerMessageId: "a" },
    ],
  };
  return normalize(raw, { id, capturedAt: "2026-01-01T00:00:00.000Z" });
}
