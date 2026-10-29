import "fake-indexeddb/auto";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  findConversationFile,
  listConversationFiles,
  writeConversationFile,
  type ArchiveDirectory,
} from "../../src/archive/conversationFile";
import type { ConversationArchive } from "../../src/archive/fileSystemArchive";
import { normalize } from "../../src/domain/normalize";
import type { RawCapture } from "../../src/domain/types";
import { parseExportDocument } from "../../src/providers/chatgpt/export";
import { readExportFile } from "../../src/providers/chatgpt/exportFile";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository } from "../../src/storage/repository";
import { storeCapturedConversation } from "../../src/ui/storeCapture";

const databases: TrailogueDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("chatgpt export", () => {
  it("keeps the current text path and leaves thoughts and abandoned turns out", () => {
    const parsed = parseExportDocument([
      conversation("conv-good", "a-tool", {
        r: { parent: null, message: null },
        lead: { parent: "r", message: text("lead", "assistant", ["手前"]) },
        u: { parent: "lead", message: text("u", "user", ["問い"]) },
        thought: {
          parent: "u",
          message: {
            id: "thought",
            author: { role: "assistant" },
            content: { content_type: "thoughts", thoughts: [{ content: "内側" }] },
          },
        },
        recap: {
          parent: "thought",
          message: {
            id: "recap",
            author: { role: "assistant" },
            content: { content_type: "reasoning_recap", content: "考えた" },
          },
        },
        answer: { parent: "recap", message: text("answer", "assistant", ["一行", "二行"]) },
        abandoned: { parent: "u", message: text("abandoned", "assistant", ["捨てた"]) },
        "a-tool": { parent: "answer", message: text("a-tool", "tool", ["道具"]) },
      }, "題"),
      null,
      conversation("conv-part", "u", {
        r: { parent: null, message: null },
        u: {
          parent: "r",
          message: {
            id: "u",
            author: { role: "user" },
            content: { content_type: "text", parts: ["問い", { kind: "image" }] },
          },
        },
      }),
      conversation("conv-missing", "gone", {
        r: { parent: null, message: null },
      }),
      conversation("conv-unlinked", "u", {
        u: { message: text("u", "user", ["切れている"]) },
      }),
      conversation("conv-cycle", "a", {
        a: { parent: "b", message: text("a", "user", ["循環"]) },
        b: { parent: "a", message: text("b", "assistant", ["循環"]) },
      }),
      conversation("conv-empty", "a", {
        r: { parent: null, message: null },
        a: { parent: "r", message: text("a", "assistant", ["だけ"]) },
      }),
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items.map((item) => (item.ok ? item.capture.sourceId : item.code))).toEqual([
      "conv-good",
      "unrecognized_structure",
      "incomplete_conversation",
      "incomplete_conversation",
      "incomplete_conversation",
      "incomplete_conversation",
      "empty_conversation",
    ]);
    const good = parsed.items[0];
    if (!good?.ok) throw new Error("missing capture");
    expect(good.capture).toMatchObject({
      provider: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/conv-good",
      sourceId: "conv-good",
      sourceKind: "conversation",
      title: "題",
      parserVersion: "chatgpt-export-1",
    });
    expect(good.capture.messages).toEqual([
      { ordinal: 0, role: "user", content: "問い", providerMessageId: "u" },
      { ordinal: 1, role: "assistant", content: "一行\n二行", providerMessageId: "answer" },
      { ordinal: 2, role: "unknown", content: "道具", providerMessageId: "a-tool" },
    ]);
  });

  it("rejects a document that is not an array and a file without conversations.json", async () => {
    expect(parseExportDocument({ conversations: [] })).toEqual({
      ok: false,
      code: "unrecognized_structure",
    });
    const zip = zipOf([
      { name: "user.json", data: new TextEncoder().encode('{"email":"secret@example.com"}'), method: 0 },
    ]);
    await expect(readExportFile(zip)).resolves.toBeNull();
  });

  it("reads conversations.json from a zip and ignores the other entries", async () => {
    const body = JSON.stringify([
      conversation("conv-zip", "u", {
        r: { parent: null, message: null },
        u: { parent: "r", message: text("u", "user", ["zipの問い"]) },
      }),
    ]);
    for (const method of [0, 8] as const) {
      const zip = zipOf([
        { name: "user.json", data: new TextEncoder().encode('{"email":"secret@example.com"}'), method: 0 },
        { name: "conversations.json", data: new TextEncoder().encode(body), method },
      ]);
      const data = await readExportFile(zip);
      const parsed = parseExportDocument(data);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || !parsed.items[0]?.ok) throw new Error("missing zip capture");
      expect(parsed.items[0].capture.messages.map((message) => message.content)).toEqual(["zipの問い"]);
      expect(JSON.stringify(data)).not.toContain("secret@example.com");
    }
  });

  it("does not write the same hash and keeps a different generation of the same conversation", async () => {
    const parsed = parseExportDocument([
      conversation("conv-same", "u", {
        r: { parent: null, message: null },
        u: { parent: "r", message: text("u", "user", ["同じ本文"]) },
      }),
    ]);
    if (!parsed.ok || !parsed.items[0]?.ok) throw new Error("missing capture");
    const capture = parsed.items[0].capture;
    const { archive } = memoryArchive();
    const repository = repositoryOf();
    const extension: RawCapture = {
      ...capture,
      parserVersion: "chatgpt-4",
      messages: [{ ordinal: 0, role: "user", content: "ページの本文" }],
    };
    await archive.write(await normalize(extension, { id: "page", capturedAt: "2026-01-01T00:00:00.000Z" }));

    await expect(storeCapturedConversation(capture, archive, repository)).resolves.toBe("stored");
    await expect(storeCapturedConversation(capture, archive, repository)).resolves.toBe("skipped");

    const listing = await archive.list();
    expect(listing.conversations.map((item) => item.parserVersion).sort()).toEqual([
      "chatgpt-4",
      "chatgpt-export-1",
    ]);
    expect(listing.conversations.every((item) => item.sourceId === "conv-same")).toBe(true);
  });
});

function conversation(
  conversationId: string,
  current: string,
  mapping: Record<string, unknown>,
  title = "ChatGPT",
) {
  return {
    conversation_id: conversationId,
    title,
    current_node: current,
    mapping,
  };
}

function text(id: string, role: string, parts: string[]) {
  return {
    id,
    author: { role },
    content: { content_type: "text", parts },
  };
}

function zipOf(entries: { name: string; data: Uint8Array; method: 0 | 8 }[]): Uint8Array {
  const parts = entries.map((entry) => zipEntry(entry.name, entry.data, entry.method));
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const zip = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    zip.set(part, offset);
    offset += part.length;
  }
  return zip;
}

function zipEntry(name: string, data: Uint8Array, method: 0 | 8): Uint8Array {
  const compressed = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
  const nameBytes = new TextEncoder().encode(name);
  const bytes = new Uint8Array(30 + nameBytes.length + compressed.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(8, method, true);
  view.setUint32(18, compressed.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  bytes.set(compressed, 30 + nameBytes.length);
  return bytes;
}

function repositoryOf() {
  const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
  databases.push(db);
  return createRepository(db);
}

function memoryArchive(): { archive: ConversationArchive } {
  const files = new Map<string, string>();
  const directory: ArchiveDirectory = {
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, contents) {
      files.set(name, contents);
    },
    async remove(name) {
      files.delete(name);
    },
    async list() {
      return [...files].map(([name, text]) => ({ name, text }));
    },
  };
  const archive: ConversationArchive = {
    async connection() {
      return "ready";
    },
    async openFolder() {
      return "ready";
    },
    findByHash(contentHash) {
      return findConversationFile(directory, contentHash);
    },
    async write(conversation) {
      await writeConversationFile(directory, conversation);
    },
    async remove() {
      return false;
    },
    list() {
      return listConversationFiles(directory);
    },
  };
  return { archive };
}
