import type { CaptureFailureCode, MessageRole, RawCapture, RawMessage } from "../../domain/types";

export const exportParserVersion = "chatgpt-export-1";

export type ExportItem =
  | { ok: true; capture: RawCapture }
  | {
      ok: false;
      code: Extract<CaptureFailureCode, "incomplete_conversation" | "empty_conversation" | "unrecognized_structure">;
      sourceId: string | null;
      title: string | null;
    };

export type ExportDocument =
  | { ok: false; code: "unrecognized_structure" }
  | { ok: true; items: ExportItem[] };

export function parseExportDocument(data: unknown): ExportDocument {
  if (!Array.isArray(data)) return { ok: false, code: "unrecognized_structure" };
  return { ok: true, items: data.map(parseConversation) };
}

function parseConversation(value: unknown): ExportItem {
  if (!isRecord(value)) {
    return { ok: false, code: "unrecognized_structure", sourceId: null, title: null };
  }
  const sourceId = typeof value.conversation_id === "string" && value.conversation_id.length > 0
    ? value.conversation_id
    : null;
  const title = titleFrom(value.title);
  if (!sourceId || !isRecord(value.mapping) || typeof value.current_node !== "string") {
    return { ok: false, code: "incomplete_conversation", sourceId, title };
  }

  const path = walkCurrent(value.mapping, value.current_node);
  if (!path) return { ok: false, code: "incomplete_conversation", sourceId, title };

  const messages: RawMessage[] = [];
  for (const node of path) {
    const read = readText(node);
    if (read === "skip") continue;
    if (read === "incomplete") return { ok: false, code: "incomplete_conversation", sourceId, title };
    messages.push({ ...read, ordinal: messages.length });
  }

  const kept = dropLeadingRemnants(messages);
  if (!kept.some((message) => message.role === "user" && message.content.trim().length > 0)) {
    return { ok: false, code: "empty_conversation", sourceId, title };
  }

  return {
    ok: true,
    capture: {
      provider: "chatgpt",
      sourceUrl: `https://chatgpt.com/c/${sourceId}`,
      sourceId,
      sourceKind: "conversation",
      title,
      parserVersion: exportParserVersion,
      messages: kept,
    },
  };
}

function walkCurrent(mapping: Record<string, unknown>, current: string): Record<string, unknown>[] | null {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let nodeId: string | null = current;
  while (nodeId) {
    if (seen.has(nodeId)) return null;
    seen.add(nodeId);
    const node: unknown = mapping[nodeId];
    if (!isRecord(node)) return null;
    chain.push(node);
    const parent: unknown = node.parent;
    if (parent === null) break;
    if (typeof parent !== "string" || parent.length === 0) return null;
    nodeId = parent;
  }
  chain.reverse();
  return chain;
}

function readText(node: Record<string, unknown>): RawMessage | "skip" | "incomplete" {
  if (node.message === null || node.message === undefined) return "skip";
  if (!isRecord(node.message)) return "incomplete";
  const content = node.message.content;
  if (!isRecord(content)) return "skip";
  if (content.content_type !== "text") return "skip";
  if (!Array.isArray(content.parts) || content.parts.some((part) => typeof part !== "string")) {
    return "incomplete";
  }
  const id = node.message.id;
  return {
    ordinal: 0,
    role: roleFrom(isRecord(node.message.author) ? node.message.author.role : undefined),
    content: content.parts.join("\n"),
    ...(typeof id === "string" && id.length > 0 ? { providerMessageId: id } : {}),
  };
}

function dropLeadingRemnants(messages: RawMessage[]): RawMessage[] {
  const start = messages.findIndex(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  if (start < 0) return [];
  return messages.slice(start).map((message, ordinal) => ({ ...message, ordinal }));
}

function titleFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (title.length === 0 || title === "ChatGPT") return null;
  return title;
}

function roleFrom(value: unknown): MessageRole {
  if (value === "user") return "user";
  if (value === "assistant") return "assistant";
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
