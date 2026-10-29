import { normalize } from "../../domain/normalize";
import { displayTitle } from "../../domain/title";
import type { CaptureFailureCode, Conversation, RawCapture } from "../../domain/types";
import { parseExportDocument, type ExportItem } from "./export";

export type ExportPreviewItem = {
  index: number;
  title: string;
  messageCount: number;
  sourceId: string | null;
  hasGeneration: boolean;
  sameHash: boolean;
  failure: Extract<
    CaptureFailureCode,
    "incomplete_conversation" | "empty_conversation" | "unrecognized_structure"
  > | null;
  capture: RawCapture | null;
};

export type ExportPreview =
  | { ok: false; code: "unrecognized_structure" }
  | { ok: true; items: ExportPreviewItem[] };

export async function buildExportPreview(
  data: unknown,
  existing: readonly Pick<Conversation, "sourceId" | "contentHash">[],
): Promise<ExportPreview> {
  const parsed = parseExportDocument(data);
  if (!parsed.ok) return parsed;
  const items: ExportPreviewItem[] = [];
  for (const [index, item] of parsed.items.entries()) {
    items.push(await previewItem(index, item, existing));
  }
  return { ok: true, items };
}

async function previewItem(
  index: number,
  item: ExportItem,
  existing: readonly Pick<Conversation, "sourceId" | "contentHash">[],
): Promise<ExportPreviewItem> {
  if (!item.ok) {
    return {
      index,
      title: item.title ?? item.sourceId ?? "会話",
      messageCount: 0,
      sourceId: item.sourceId,
      hasGeneration: false,
      sameHash: false,
      failure: item.code,
      capture: null,
    };
  }
  const normalized = await normalize(item.capture, {
    id: "preview",
    capturedAt: "1970-01-01T00:00:00.000Z",
  });
  const sameHash = existing.some((record) => record.contentHash === normalized.contentHash);
  return {
    index,
    title: displayTitle(item.capture.title, normalized.messages),
    messageCount: normalized.messages.length,
    sourceId: item.capture.sourceId,
    hasGeneration: existing.some(
      (record) => record.sourceId === item.capture.sourceId && record.contentHash !== normalized.contentHash,
    ),
    sameHash,
    failure: null,
    capture: item.capture,
  };
}
