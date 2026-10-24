import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { normalize } from "../../src/domain/normalize";
import type { Conversation, RawCapture } from "../../src/domain/types";
import { alignCache } from "../../src/storage/alignCache";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository } from "../../src/storage/repository";

const databases: TrailogueDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("alignCache", () => {
  it("marks the cache aligned only after the folder rows replace it", async () => {
    const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
    databases.push(db);
    const repository = createRepository(db);
    const kept = await conversation("kept");
    const dropped = await conversation("dropped");
    await repository.insert(kept);
    await repository.insert(dropped);
    await db.archiveHandles.put({ id: "directory", handle: {} as FileSystemDirectoryHandle });
    expect(await repository.isFolderAligned()).toBe(false);

    await alignCache(repository, [kept]);

    expect(await repository.isFolderAligned()).toBe(true);
    expect(await repository.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await repository.findBySource(kept.sourceId)).toEqual([
      expect.objectContaining({ id: kept.id }),
    ]);
    expect(await db.archiveHandles.get("directory")).toMatchObject({ id: "directory" });
  });
});

function conversation(content: string): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-1",
    messages: [{ ordinal: 0, role: "user", content }],
  };
  return normalize(raw, { id: crypto.randomUUID(), capturedAt: "2026-01-01T00:00:00.000Z" });
}
