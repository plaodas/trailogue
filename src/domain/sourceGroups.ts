import { messageFingerprints, relateImport, type ImportDifference } from "./importStatus";
import type { Conversation } from "./types";

export type SourceGroupRecord = {
  conversation: Conversation;
  relation: ImportDifference | null;
};

export type SourceGroup = {
  sourceId: string;
  records: SourceGroupRecord[];
};

export function groupRecords(records: readonly Conversation[]): SourceGroup[] {
  const buckets = new Map<string, Conversation[]>();
  for (const record of records) {
    const group = buckets.get(record.sourceId);
    if (group) group.push(record);
    else buckets.set(record.sourceId, [record]);
  }
  const groups = [...buckets.entries()].map(([sourceId, members]) => {
    const ordered = [...members].sort(byCapture);
    return { sourceId, records: ordered.map((conversation) => ({ conversation, relation: null })) };
  });
  groups.sort(byLatest);
  return groups;
}

export async function relateGroups(groups: readonly SourceGroup[]): Promise<SourceGroup[]> {
  const related: SourceGroup[] = [];
  for (const group of groups) {
    if (group.records.length < 2) {
      related.push(group);
      continue;
    }
    const fingerprints = await Promise.all(
      group.records.map((record) => messageFingerprints(record.conversation.messages)),
    );
    related.push({
      sourceId: group.sourceId,
      records: group.records.map((record, index) => {
        const others = fingerprints.filter((_, other) => other !== index);
        const relation = relateImport(fingerprints[index] ?? [], others);
        return {
          conversation: record.conversation,
          relation: relation.kind === "different" ? relation.reason : null,
        };
      }),
    });
  }
  return related;
}

function byCapture(left: Conversation, right: Conversation): number {
  if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function byLatest(left: SourceGroup, right: SourceGroup): number {
  const leftAt = left.records.at(-1)?.conversation.capturedAt ?? "";
  const rightAt = right.records.at(-1)?.conversation.capturedAt ?? "";
  if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1;
  return left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0;
}
