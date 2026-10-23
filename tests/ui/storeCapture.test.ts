import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findConversationFile,
  listConversationFiles,
  writeConversationFile,
  type ArchiveDirectory,
} from "../../src/archive/conversationFile";
import type { ConversationArchive } from "../../src/archive/fileSystemArchive";
import { normalize } from "../../src/domain/normalize";
import type { RawCapture } from "../../src/domain/types";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository } from "../../src/storage/repository";
import { storeCapturedConversation } from "../../src/ui/storeCapture";

const databases: TrailogueDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("storeCapturedConversation", () => {
  it("does not write a conversation whose hash is already in the folder", async () => {
    const { archive } = memoryArchive();
    const repository = repositoryOf();
    const capture = sample();
    await archive.write(
      await normalize(capture, { id: "kept", capturedAt: "2026-01-01T00:00:00.000Z" }),
    );
    const write = vi.spyOn(archive, "write");

    await expect(storeCapturedConversation(capture, archive, repository)).resolves.toBe("skipped");

    expect(write).not.toHaveBeenCalled();
    expect(await repository.list()).toHaveLength(0);
  });

  it("does not insert into the working copy when the folder write fails", async () => {
    const { archive } = memoryArchive();
    const repository = repositoryOf();
    const insert = vi.spyOn(repository, "insert");
    archive.write = async () => {
      throw new Error("disk");
    };

    await expect(storeCapturedConversation(sample(), archive, repository)).resolves.toBe("failed");

    expect(insert).not.toHaveBeenCalled();
  });
});

function repositoryOf() {
  const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
  databases.push(db);
  return createRepository(db);
}

function sample(): RawCapture {
  return {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/one",
    sourceId: "one",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-2",
    messages: [{ ordinal: 0, role: "user", content: "本文" }],
  };
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
    async list() {
      return [...files.entries()].map(([name, text]) => ({ name, text }));
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
    write(conversation) {
      return writeConversationFile(directory, conversation);
    },
    list() {
      return listConversationFiles(directory);
    },
  };
  return { archive };
}
