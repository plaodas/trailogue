import Dexie, { type Table } from "dexie";
import type { Conversation } from "../domain/types";

export const FOLDER_ALIGNMENT_ID = "folder-alignment";

export type ArchiveHandleRecord = {
  id: string;
  handle: FileSystemDirectoryHandle;
};

export type FolderAlignmentRecord = {
  id: typeof FOLDER_ALIGNMENT_ID;
  folderAligned: true;
};

export type ArchiveHandleRow = ArchiveHandleRecord | FolderAlignmentRecord;

const CONVERSATION_INDEXES = "id, provider, sourceId, &contentHash, capturedAt";

export class TrailogueDatabase extends Dexie {
  conversations!: Table<Conversation, string>;
  archiveHandles!: Table<ArchiveHandleRow, string>;

  constructor(name = "trailogue") {
    super(name);
    this.version(1).stores({
      conversations: CONVERSATION_INDEXES,
    });
    this.version(2).stores({
      conversations: CONVERSATION_INDEXES,
      archiveHandles: "id",
    });
    this.version(3).stores({
      conversations: CONVERSATION_INDEXES,
      archiveHandles: "id, folderAligned",
    });
    this.conversations = this.table("conversations");
    this.archiveHandles = this.table("archiveHandles");
  }
}

export function isArchiveDirectory(value: ArchiveHandleRow): value is ArchiveHandleRecord {
  return "handle" in value && value.handle !== undefined;
}

export function isFolderAlignment(value: ArchiveHandleRow | undefined): value is FolderAlignmentRecord {
  return !!value && value.id === FOLDER_ALIGNMENT_ID && "folderAligned" in value && value.folderAligned === true;
}

export function openDatabase(name = "trailogue"): TrailogueDatabase {
  return new TrailogueDatabase(name);
}
