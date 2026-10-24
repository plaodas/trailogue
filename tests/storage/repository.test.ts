import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { normalize } from "../../src/domain/normalize";
import type { Conversation, RawCapture } from "../../src/domain/types";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository, type ConversationRepository } from "../../src/storage/repository";

const databases: TrailogueDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("conversation repository", () => {
  it("stores one record for the same content hash and keeps an older body", async () => {
    const repository = createTestRepository();
    const first = await conversation("conversation-1", "初めの問い", "2026-01-01T00:00:00.000Z");
    const same = await conversation("conversation-1", "初めの問い", "2026-02-01T00:00:00.000Z");
    const changed = await conversation("conversation-1", "あとから足した問い", "2026-03-01T00:00:00.000Z");

    const inserted = await repository.insert(first);
    const duplicate = await repository.insert({ ...same, id: "other-id" });
    const next = await repository.insert(changed);

    expect(duplicate).toMatchObject({ id: inserted.id, messages: [{ content: "初めの問い" }] });
    expect(next.id).toBe(changed.id);
    const stored = await repository.list();
    expect(stored.map((record) => record.id)).toEqual([changed.id, inserted.id]);
    expect(await repository.findById(inserted.id)).toMatchObject({
      messages: [{ content: "初めの問い" }],
    });
  });

  it("replaces the cached row with the folder conversation for the same hash", async () => {
    const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
    databases.push(db);
    const repository = createRepository(db);
    const cached = await conversation("conversation-1", "初めの問い", "2026-01-01T00:00:00.000Z");
    const other = await conversation("conversation-1", "あとの問い", "2026-02-01T00:00:00.000Z");
    await repository.insert(cached);
    await repository.insert(other);
    await db.archiveHandles.put({ id: "directory", handle: {} as FileSystemDirectoryHandle });
    const filed = {
      ...cached,
      id: "from-file",
      title: "ファイルの題",
      capturedAt: "2026-04-01T00:00:00.000Z",
    };

    const mirrored = await repository.mirror(filed);

    expect(mirrored.id).toBe("from-file");
    expect(await repository.findByHash(cached.contentHash)).toMatchObject({
      id: "from-file",
      title: "ファイルの題",
      capturedAt: "2026-04-01T00:00:00.000Z",
    });
    expect(await repository.findById(cached.id)).toBeUndefined();
    expect((await repository.findByHash(other.contentHash))?.id).toBe(other.id);
    expect(await repository.list()).toHaveLength(2);
    expect(await db.archiveHandles.get("directory")).toMatchObject({ id: "directory" });
  });

  it("keeps version 1 conversations when the archive table is added", async () => {
    const name = `trailogue-test-${crypto.randomUUID()}`;
    const record = await conversation("conversation-1", "初めの問い", "2026-01-01T00:00:00.000Z");
    await seedVersion1(name, record);

    const db = openDatabase(name);
    databases.push(db);
    expect(await createRepository(db).findById(record.id)).toMatchObject({
      messages: [{ content: "初めの問い" }],
    });
    expect(await db.archiveHandles.get("directory")).toBeUndefined();
  });

  it("removes one hash and leaves the other row and the folder handle", async () => {
    const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
    databases.push(db);
    const repository = createRepository(db);
    const first = await conversation("conversation-1", "初めの問い", "2026-01-01T00:00:00.000Z");
    const second = await conversation("conversation-1", "あとの問い", "2026-02-01T00:00:00.000Z");
    await repository.insert(first);
    await repository.insert(second);
    await db.archiveHandles.put({ id: "directory", handle: {} as FileSystemDirectoryHandle });

    await repository.removeByHash(first.contentHash);

    expect(await repository.findByHash(first.contentHash)).toBeUndefined();
    expect((await repository.findByHash(second.contentHash))?.id).toBe(second.id);
    expect(await repository.list()).toHaveLength(1);
    expect(await db.archiveHandles.get("directory")).toMatchObject({ id: "directory" });
  });
});

function createTestRepository(): ConversationRepository {
  const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
  databases.push(db);
  return createRepository(db);
}

function conversation(sourceId: string, content: string, capturedAt: string): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "copilot",
    sourceUrl: `https://copilot.cloud.microsoft/chat/conversation/${sourceId}`,
    sourceId,
    sourceKind: "conversation",
    title: "題",
    parserVersion: "copilot-1",
    messages: [{ ordinal: 0, role: "user", content }],
  };
  return normalize(raw, { id: crypto.randomUUID(), capturedAt });
}

function seedVersion1(name: string, record: Conversation): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore("conversations", { keyPath: "id" });
      store.createIndex("provider", "provider");
      store.createIndex("sourceId", "sourceId");
      store.createIndex("contentHash", "contentHash", { unique: true });
      store.createIndex("capturedAt", "capturedAt");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("conversations", "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.objectStore("conversations").add(record);
    };
  });
}
