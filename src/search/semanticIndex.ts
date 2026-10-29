import type { Conversation, MessageRole } from "../domain/types";
import { semanticLocationKey, validVector } from "./rank";

export const SEMANTIC_INDEX_VERSION = 1;

export type SemanticIndexEntry = {
  contentHash: string;
  conversationId: string;
  messageId: string;
  ordinal: number;
  role: MessageRole;
  vector: number[];
};

export type SemanticIndex = {
  version: typeof SEMANTIC_INDEX_VERSION;
  model: string;
  dimensions: number;
  entries: SemanticIndexEntry[];
};

export type SemanticDocument = Omit<SemanticIndexEntry, "vector"> & { content: string };

export function emptySemanticIndex(model: string): SemanticIndex {
  return { version: SEMANTIC_INDEX_VERSION, model, dimensions: 0, entries: [] };
}

export function parseSemanticIndex(text: string): SemanticIndex | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.version !== SEMANTIC_INDEX_VERSION ||
    typeof record.model !== "string" ||
    record.model.trim() === "" ||
    !Number.isInteger(record.dimensions) ||
    (record.dimensions as number) < 0 ||
    !Array.isArray(record.entries)
  ) {
    return undefined;
  }
  const dimensions = record.dimensions as number;
  if ((dimensions === 0) !== (record.entries.length === 0)) return undefined;
  const entries: SemanticIndexEntry[] = [];
  const seen = new Set<string>();
  for (const item of record.entries) {
    const entry = parseEntry(item, dimensions);
    if (!entry) return undefined;
    const key = semanticLocationKey(entry.contentHash, entry.messageId);
    if (seen.has(key)) return undefined;
    seen.add(key);
    entries.push(entry);
  }
  return {
    version: SEMANTIC_INDEX_VERSION,
    model: record.model,
    dimensions,
    entries,
  };
}

export function serializeSemanticIndex(index: SemanticIndex): string {
  return `${JSON.stringify(index)}\n`;
}

export function semanticDocuments(conversations: readonly Conversation[]): SemanticDocument[] {
  const documents: SemanticDocument[] = [];
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.content === "") continue;
      documents.push({
        contentHash: conversation.contentHash,
        conversationId: conversation.id,
        messageId: message.id,
        ordinal: message.ordinal,
        role: message.role,
        content: message.content,
      });
    }
  }
  return documents;
}

export function reconcileSemanticIndex(
  index: SemanticIndex | undefined,
  model: string,
  documents: readonly SemanticDocument[],
): { index: SemanticIndex; missing: SemanticDocument[]; changed: boolean } {
  const base = index?.model === model ? index : emptySemanticIndex(model);
  const documentsByKey = new Map(
    documents.map((document) => [semanticLocationKey(document.contentHash, document.messageId), document]),
  );
  const entries = base.entries.filter((entry) => {
    const document = documentsByKey.get(semanticLocationKey(entry.contentHash, entry.messageId));
    return (
      !!document &&
      document.conversationId === entry.conversationId &&
      document.ordinal === entry.ordinal &&
      document.role === entry.role &&
      validVector(entry.vector, base.dimensions)
    );
  });
  const indexed = new Set(entries.map((entry) => semanticLocationKey(entry.contentHash, entry.messageId)));
  const missing = documents.filter((document) => !indexed.has(semanticLocationKey(document.contentHash, document.messageId)));
  const changed = base !== index || entries.length !== base.entries.length;
  return { index: { ...base, entries }, missing, changed };
}

function parseEntry(value: unknown, dimensions: number): SemanticIndexEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(item.contentHash) ||
    typeof item.conversationId !== "string" ||
    item.conversationId === "" ||
    typeof item.messageId !== "string" ||
    item.messageId === "" ||
    !Number.isInteger(item.ordinal) ||
    (item.ordinal as number) < 0 ||
    (item.role !== "user" && item.role !== "assistant" && item.role !== "unknown") ||
    !validVector(item.vector, dimensions)
  ) {
    return undefined;
  }
  return {
    contentHash: item.contentHash,
    conversationId: item.conversationId,
    messageId: item.messageId,
    ordinal: item.ordinal as number,
    role: item.role,
    vector: item.vector,
  };
}
