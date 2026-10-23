import type { Conversation } from "../domain/types";
import { markdownFilename, toMarkdown } from "../export/markdown";

export function downloadMarkdown(conversation: Conversation, capturedAt = conversation.capturedAt): void {
  const text = toMarkdown({ ...conversation, capturedAt });
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = markdownFilename(conversation.title);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
