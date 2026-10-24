import { contentHash } from "../domain/hash";
import type { Conversation, Message, MessageRole, ProviderId, SourceKind } from "../domain/types";

export type ArchiveDirectory = {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<{ name: string; text: string }[]>;
};

export type ArchiveListing = {
  conversations: Conversation[];
  unreadable: number;
};

const PROVIDERS = new Set<ProviderId>(["copilot", "chatgpt"]);
const SOURCE_KINDS = new Set<SourceKind>(["conversation", "shared"]);
const ROLES = new Set<MessageRole>(["user", "assistant", "unknown"]);

export function conversationFileName(contentHashValue: string): string {
  return `${contentHashValue}.json`;
}

export function serializeConversation(conversation: Conversation): string {
  return `${JSON.stringify(conversation)}\n`;
}

export async function readConversationFile(text: string): Promise<Conversation | null> {
  try {
    const conversation = toConversation(JSON.parse(text));
    if (!conversation) return null;
    const hash = await contentHash({
      provider: conversation.provider,
      sourceId: conversation.sourceId,
      messages: conversation.messages,
    });
    if (hash !== conversation.contentHash) return null;
    return conversation;
  } catch {
    return null;
  }
}

export async function findConversationFile(
  directory: ArchiveDirectory,
  contentHashValue: string,
): Promise<Conversation | undefined> {
  const name = conversationFileName(contentHashValue);
  const text = await directory.read(name);
  if (text === null) return undefined;
  const conversation = await readConversationFile(text);
  if (!conversation || conversationFileName(conversation.contentHash) !== name) return undefined;
  return conversation;
}

export async function writeConversationFile(
  directory: ArchiveDirectory,
  conversation: Conversation,
): Promise<void> {
  const name = conversationFileName(conversation.contentHash);
  const serialized = serializeConversation(conversation);
  const verified = await readConversationFile(serialized);
  if (!verified || conversationFileName(verified.contentHash) !== name) {
    throw new Error("conversation does not verify");
  }
  const existing = await directory.read(name);
  if (existing !== null) {
    const stored = await readConversationFile(existing);
    if (stored && conversationFileName(stored.contentHash) === name) return;
  }
  await directory.write(name, serialized);
}

export async function removeConversationFile(
  directory: ArchiveDirectory,
  conversation: Conversation,
): Promise<boolean> {
  const name = conversationFileName(conversation.contentHash);
  const text = await directory.read(name);
  if (text === null) return true;
  const stored = await readConversationFile(text);
  if (!stored || stored.contentHash !== conversation.contentHash) return false;
  if (conversationFileName(stored.contentHash) !== name) return false;
  await directory.remove(name);
  return true;
}

export async function listConversationFiles(directory: ArchiveDirectory): Promise<ArchiveListing> {
  const files = await directory.list();
  const conversations: Conversation[] = [];
  let unreadable = 0;
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    const conversation = await readConversationFile(file.text);
    if (!conversation || conversationFileName(conversation.contentHash) !== file.name) {
      unreadable += 1;
      continue;
    }
    conversations.push(conversation);
  }
  conversations.sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  return { conversations, unreadable };
}

function toConversation(value: unknown): Conversation | null {
  if (!isRecord(value)) return null;
  const provider = value.provider;
  const sourceKind = value.sourceKind;
  if (typeof provider !== "string" || !PROVIDERS.has(provider as ProviderId)) return null;
  if (typeof sourceKind !== "string" || !SOURCE_KINDS.has(sourceKind as SourceKind)) return null;
  if (!isText(value.id) || !isText(value.sourceUrl) || !isText(value.sourceId)) return null;
  if (typeof value.title !== "string" || !isText(value.capturedAt) || !isText(value.parserVersion)) return null;
  if (!isText(value.contentHash) || !Array.isArray(value.messages)) return null;
  const messages: Message[] = [];
  for (const message of value.messages) {
    const parsed = toMessage(message);
    if (!parsed) return null;
    messages.push(parsed);
  }
  return {
    id: value.id,
    provider: provider as ProviderId,
    sourceUrl: value.sourceUrl,
    sourceId: value.sourceId,
    sourceKind: sourceKind as SourceKind,
    title: value.title,
    capturedAt: value.capturedAt,
    parserVersion: value.parserVersion,
    contentHash: value.contentHash,
    messages,
  };
}

function toMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null;
  if (!isText(value.id) || typeof value.ordinal !== "number" || !Number.isInteger(value.ordinal)) return null;
  if (typeof value.role !== "string" || !ROLES.has(value.role as MessageRole)) return null;
  if (typeof value.content !== "string") return null;
  if (value.providerMessageId !== undefined && typeof value.providerMessageId !== "string") return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    role: value.role as MessageRole,
    content: value.content,
    ...(typeof value.providerMessageId === "string" ? { providerMessageId: value.providerMessageId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
