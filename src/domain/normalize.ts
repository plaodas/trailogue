import { contentHash } from "./hash";
import { displayTitle } from "./title";
import type { Conversation, Message, RawCapture, RawMessage } from "./types";

export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export async function normalize(
  raw: RawCapture,
  context: { id: string; capturedAt: string },
): Promise<Conversation> {
  const normalized = [...raw.messages]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((message, ordinal) => ({
      ordinal,
      role: message.role,
      content: normalizeContent(message.content),
      providerMessageId: message.providerMessageId,
    }));
  const usedIds = new Set<string>();
  const messages: Message[] = normalized.map((message) => ({
    id: messageId(message, usedIds),
    ordinal: message.ordinal,
    role: message.role,
    content: message.content,
    ...(message.providerMessageId
      ? { providerMessageId: message.providerMessageId }
      : {}),
  }));

  return {
    id: context.id,
    provider: raw.provider,
    sourceUrl: raw.sourceUrl,
    sourceId: raw.sourceId,
    sourceKind: raw.sourceKind,
    title: displayTitle(raw.title, messages),
    capturedAt: context.capturedAt,
    parserVersion: raw.parserVersion,
    contentHash: await contentHash({
      provider: raw.provider,
      sourceId: raw.sourceId,
      messages,
    }),
    messages,
  };
}

function messageId(message: RawMessage, usedIds: Set<string>): string {
  const preferred = message.providerMessageId?.trim();
  const base = preferred ? preferred : `ordinal-${message.ordinal}`;
  const id = usedIds.has(base) ? `${base}-${message.ordinal}` : base;
  usedIds.add(id);
  return id;
}
