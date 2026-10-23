import type { Conversation, ThoughtNode } from "./types";

export function deriveThoughtPath(conversation: Conversation): ThoughtNode[] {
  return conversation.messages.map((message) => ({
    id: `path-${message.id}`,
    ordinal: message.ordinal,
    role: message.role,
    messageId: message.id,
  }));
}
