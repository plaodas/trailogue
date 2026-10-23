import Dexie, { type Table } from "dexie";
import type { Conversation } from "../domain/types";

export class TrailogueDatabase extends Dexie {
  conversations!: Table<Conversation, string>;

  constructor(name = "trailogue") {
    super(name);
    this.version(1).stores({
      conversations: "id, provider, sourceId, &contentHash, capturedAt",
    });
    this.conversations = this.table("conversations");
  }
}

export function openDatabase(name = "trailogue"): TrailogueDatabase {
  return new TrailogueDatabase(name);
}
