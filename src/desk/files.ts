import { conversationFileName, readConversationFile } from "../archive/conversationFile";
import type { Conversation } from "../domain/types";
import type { DeskRecord, OpenedMarks } from "./album";

export const CONVERSATION_FILE_NAME = /^[0-9a-f]{64}\.json$/;
export const OPENED_MARKS_NAME = "opened-marks";

export async function readDeskFiles(
  files: readonly { name: string; text: string }[],
): Promise<{ records: DeskRecord[]; conversations: Conversation[]; unreadable: number }> {
  const records: DeskRecord[] = [];
  const conversations: Conversation[] = [];
  let unreadable = 0;
  for (const file of files) {
    if (!CONVERSATION_FILE_NAME.test(file.name)) continue;
    const conversation = await readConversationFile(file.text);
    if (!conversation || conversationFileName(conversation.contentHash) !== file.name) {
      unreadable += 1;
      continue;
    }
    conversations.push(conversation);
    records.push({
      id: conversation.id,
      sourceId: conversation.sourceId,
      provider: conversation.provider,
      title: conversation.title,
      capturedAt: conversation.capturedAt,
      contentHash: conversation.contentHash,
      messageCount: conversation.messages.length,
      parserVersion: conversation.parserVersion,
    });
  }
  return { records, conversations, unreadable };
}

export function parseOpenedMarks(text: string): OpenedMarks {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const opened: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!CONVERSATION_FILE_NAME.test(`${key}.json`)) continue;
      if (typeof value !== "string" || value.length === 0) continue;
      opened[key] = value;
    }
    return opened;
  } catch {
    return {};
  }
}

export function serializeOpenedMarks(opened: OpenedMarks): string {
  return `${JSON.stringify(opened)}\n`;
}
