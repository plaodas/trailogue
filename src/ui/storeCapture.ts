import { normalize } from "../domain/normalize";
import type { RawCapture } from "../domain/types";
import type { ConversationArchive } from "../archive/fileSystemArchive";
import type { ConversationRepository } from "../storage/repository";

export async function storeCapturedConversation(
  capture: RawCapture,
  archive: ConversationArchive,
  repository: ConversationRepository,
): Promise<"stored" | "skipped" | "failed"> {
  try {
    if ((await archive.connection()) !== "ready") return "failed";
    const conversation = await normalize(capture, {
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
    });
    if (await archive.findByHash(conversation.contentHash)) return "skipped";
    await archive.write(conversation);
    const onDisk = await archive.findByHash(conversation.contentHash);
    if (!onDisk) return "failed";
    await repository.insert(onDisk);
    return "stored";
  } catch {
    return "failed";
  }
}
