import Dexie, { type Table } from "dexie";
import type { Conversation } from "../domain/types";

export type ArchiveHandleRecord = {
  id: string;
  handle: FileSystemDirectoryHandle;
};

const CONVERSATION_INDEXES = "id, provider, sourceId, &contentHash, capturedAt";

export class TrailogueDatabase extends Dexie {
  conversations!: Table<Conversation, string>;
  archiveHandles!: Table<ArchiveHandleRecord, string>;

  constructor(name = "trailogue") {
    super(name);
    this.version(1).stores({
      conversations: CONVERSATION_INDEXES,
    });
    this.version(2).stores({
      conversations: CONVERSATION_INDEXES,
      archiveHandles: "id",
    });
    this.conversations = this.table("conversations");
    this.archiveHandles = this.table("archiveHandles");
  }
}

export function openDatabase(name = "trailogue"): TrailogueDatabase {
  return new TrailogueDatabase(name);
}
