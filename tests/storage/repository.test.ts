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
