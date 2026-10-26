import type { ProviderId } from "../domain/types";

export type DeskRecord = {
  id: string;
  sourceId: string;
  provider: ProviderId;
  title: string;
  capturedAt: string;
  contentHash: string;
  messageCount: number;
};

export type Ring = {
  id: string;
  contentHash: string;
  capturedAt: string;
  title: string;
  messageCount: number;
};

export type Cover = {
  sourceId: string;
  provider: ProviderId;
  title: string;
  capturedAt: string;
  day: string;
  month: string;
  rings: Ring[];
};

export type OpenedMarks = Readonly<Record<string, string>>;

export function localDay(capturedAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(capturedAt));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function groupCovers(records: readonly DeskRecord[], timeZone: string): Cover[] {
  const groups = new Map<string, DeskRecord[]>();
  for (const record of records) {
    const group = groups.get(record.sourceId);
    if (group) group.push(record);
    else groups.set(record.sourceId, [record]);
  }
  const covers: Cover[] = [];
  for (const [sourceId, group] of groups) {
    const ordered = [...group].sort(byRecord);
    const latest = ordered[ordered.length - 1];
    if (!latest) continue;
    const day = localDay(latest.capturedAt, timeZone);
    covers.push({
      sourceId,
      provider: latest.provider,
      title: latest.title,
      capturedAt: latest.capturedAt,
      day,
      month: day.slice(0, 7),
      rings: ordered.map((record) => ({
        id: record.id,
        contentHash: record.contentHash,
        capturedAt: record.capturedAt,
        title: record.title,
        messageCount: record.messageCount,
      })),
    });
  }
  covers.sort(byCapture);
  return covers;
}

export function coversOnDay(covers: readonly Cover[], day: string): Cover[] {
  return covers.filter((cover) => cover.day === day).sort(byCapture);
}

export function latestDay(covers: readonly Cover[]): string | null {
  let latest: string | null = null;
  for (const cover of covers) {
    if (latest === null || cover.day > latest) latest = cover.day;
  }
  return latest;
}

export function monthsDescending(covers: readonly Cover[]): string[] {
  return [...new Set(covers.map((cover) => cover.month))].sort((left, right) => right.localeCompare(left));
}

export function daysInMonth(covers: readonly Cover[], month: string): string[] {
  return [...new Set(covers.filter((cover) => cover.month === month).map((cover) => cover.day))].sort((left, right) =>
    right.localeCompare(left),
  );
}

export function openedCovers(covers: readonly Cover[], opened: OpenedMarks): Cover[] {
  return covers
    .filter((cover) => lastOpened(cover, opened) !== null)
    .sort((left, right) => {
      const leftAt = lastOpened(left, opened) ?? "";
      const rightAt = lastOpened(right, opened) ?? "";
      if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
      return byCapture(left, right);
    });
}

export function reunionCover(covers: readonly Cover[], opened: OpenedMarks): Cover | null {
  return openedCovers(covers, opened)[0] ?? null;
}

export function unopenedCovers(covers: readonly Cover[], opened: OpenedMarks): Cover[] {
  return covers.filter((cover) => lastOpened(cover, opened) === null).sort(byCapture);
}

export function lastOpened(cover: Cover, opened: OpenedMarks): string | null {
  let latest: string | null = null;
  for (const ring of cover.rings) {
    const at = opened[ring.contentHash];
    if (!at) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

function byRecord(left: DeskRecord, right: DeskRecord): number {
  if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function byCapture(left: Cover, right: Cover): number {
  if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? -1 : 1;
  return left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0;
}
