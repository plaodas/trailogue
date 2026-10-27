import type { Conversation, MessageRole, ProviderId } from "../domain/types";

export type TextMatch = {
  conversationId: string;
  messageId: string;
  ordinal: number;
  role: MessageRole;
  content: string;
  title: string;
  provider: ProviderId;
  capturedAt: string;
  contentHash: string;
};

export type TextSpan = {
  text: string;
  match: boolean;
};

export function findTextMatches(conversations: readonly Conversation[], query: string): TextMatch[] {
  if (query.trim() === "") return [];
  const matches: TextMatch[] = [];
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (!message.content.includes(query)) continue;
      matches.push({
        conversationId: conversation.id,
        messageId: message.id,
        ordinal: message.ordinal,
        role: message.role,
        content: message.content,
        title: conversation.title,
        provider: conversation.provider,
        capturedAt: conversation.capturedAt,
        contentHash: conversation.contentHash,
      });
    }
  }
  matches.sort(byMatch);
  return matches;
}

export function matchingLines(content: string, query: string): string[] {
  if (query === "") return [];
  const ranges = matchRanges(content, query);
  if (ranges.length === 0) return [];
  const lines = lineSpans(content);
  return lines
    .filter((line) => ranges.some((range) => range.start < line.end && range.end > line.start))
    .map((line) => line.text);
}

export function markQuery(text: string, query: string): TextSpan[] {
  if (query === "") return [{ text, match: false }];
  const spans: TextSpan[] = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const found = text.indexOf(query, cursor);
    if (found === -1) {
      if (cursor < text.length || spans.length === 0) spans.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (found > cursor) spans.push({ text: text.slice(cursor, found), match: false });
    spans.push({ text: query, match: true });
    cursor = found + query.length;
  }
  return spans;
}

function matchRanges(content: string, query: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  while (cursor <= content.length) {
    const found = content.indexOf(query, cursor);
    if (found === -1) break;
    ranges.push({ start: found, end: found + query.length });
    cursor = found + query.length;
  }
  return ranges;
}

function lineSpans(content: string): { text: string; start: number; end: number }[] {
  const lines: { text: string; start: number; end: number }[] = [];
  let start = 0;
  for (let index = 0; index <= content.length; index += 1) {
    if (index !== content.length && content[index] !== "\n") continue;
    lines.push({ text: content.slice(start, index), start, end: index });
    start = index + 1;
  }
  return lines;
}

function byMatch(left: TextMatch, right: TextMatch): number {
  if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? -1 : 1;
  if (left.conversationId !== right.conversationId) {
    return left.conversationId < right.conversationId ? -1 : 1;
  }
  return left.ordinal - right.ordinal;
}
