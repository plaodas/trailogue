import type { Conversation } from "../domain/types";
import type { ConversationRepository } from "./repository";

export async function alignCache(
  repository: ConversationRepository,
  conversations: readonly Conversation[],
): Promise<void> {
  const present = new Set(conversations.map((conversation) => conversation.contentHash));
  const stored = await repository.list();
  for (const row of stored) {
    if (!present.has(row.contentHash)) await repository.removeByHash(row.contentHash);
  }
  for (const conversation of conversations) {
    await repository.mirror(conversation);
  }
  await repository.markFolderAligned();
}