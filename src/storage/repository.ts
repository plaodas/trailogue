import type { Conversation } from "../domain/types";
import type { TrailogueDatabase } from "./db";

export type ConversationRepository = {
  insert(conversation: Conversation): Promise<Conversation>;
  list(): Promise<Conversation[]>;
  findById(id: string): Promise<Conversation | undefined>;
  findByHash(contentHash: string): Promise<Conversation | undefined>;
  removeByHash(contentHash: string): Promise<void>;
};

export function createRepository(db: TrailogueDatabase): ConversationRepository {
  async function findByHash(contentHash: string): Promise<Conversation | undefined> {
    return db.conversations.where("contentHash").equals(contentHash).first();
  }

  return {
    async insert(conversation) {
      const existing = await findByHash(conversation.contentHash);
      if (existing) return existing;
      try {
        await db.conversations.add(conversation);
      } catch (error) {
        const raced = await findByHash(conversation.contentHash);
        if (raced) return raced;
        throw error;
      }
      return conversation;
    },
    list() {
      return db.conversations.orderBy("capturedAt").reverse().toArray();
    },
    findById(id) {
      return db.conversations.get(id);
    },
    findByHash,
    async removeByHash(contentHash) {
      await db.conversations.where("contentHash").equals(contentHash).delete();
    },
  };
}
