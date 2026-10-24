import { messageFingerprints } from "../domain/importStatus";
import { normalize } from "../domain/normalize";
import type { ParseResult, ProviderId } from "../domain/types";
import { classifyPage } from "./page";

export const IMPORT_WATCH = "trailogue:import-watch";
export const IMPORT_RETRY_INTERVAL_MS = 2000;
export const IMPORT_RETRY_WINDOW_MS = 10000;

const STATUS_ID = "import-status";
const STATUS_CAPTURED_AT = "1970-01-01T00:00:00.000Z";

export type ImportWatchReport =
  | { type: typeof IMPORT_WATCH; kind: "clear" }
  | { type: typeof IMPORT_WATCH; kind: "pending" }
  | { type: typeof IMPORT_WATCH; kind: "unavailable" }
  | {
    type: typeof IMPORT_WATCH;
    kind: "ready";
    provider: ProviderId;
    sourceId: string;
    fingerprints: string[];
  };

export function isImportWatchReport(message: unknown): message is ImportWatchReport {
  if (!isRecord(message) || message.type !== IMPORT_WATCH) return false;
  if (message.kind === "clear" || message.kind === "pending" || message.kind === "unavailable") return true;
  if (message.kind !== "ready") return false;
  if (message.provider !== "copilot" && message.provider !== "chatgpt") return false;
  if (typeof message.sourceId !== "string" || message.sourceId.length === 0) return false;
  return Array.isArray(message.fingerprints) && message.fingerprints.every((item) => typeof item === "string");
}

export async function readImportReport(
  href: string,
  parse: () => ParseResult,
): Promise<ImportWatchReport> {
  if (!classifyPage(href)) return { type: IMPORT_WATCH, kind: "clear" };
  const parsed = parse();
  if (!parsed.ok) {
    return {
      type: IMPORT_WATCH,
      kind: parsed.code === "not_ready" ? "pending" : "unavailable",
    };
  }
  const normalized = await normalize(parsed.capture, {
    id: STATUS_ID,
    capturedAt: STATUS_CAPTURED_AT,
  });
  return {
    type: IMPORT_WATCH,
    kind: "ready",
    provider: normalized.provider,
    sourceId: normalized.sourceId,
    fingerprints: await messageFingerprints(normalized.messages),
  };
}

export function createImportWatcher(host: {
  href: () => string;
  read: () => Promise<ImportWatchReport>;
  send: (report: ImportWatchReport) => void;
  now: () => number;
  schedule: (delayMs: number, run: () => void) => () => void;
}): { refresh: () => void; stop: () => void } {
  let generation = 0;
  let cancelTimer = () => {};

  function stopTimer() {
    cancelTimer();
    cancelTimer = () => {};
  }

  function refresh() {
    stopTimer();
    const token = ++generation;
    const href = host.href();
    if (!classifyPage(href)) {
      host.send({ type: IMPORT_WATCH, kind: "clear" });
      return;
    }
    void attempt(token, href, host.now());
  }

  function stop() {
    generation += 1;
    stopTimer();
  }

  async function attempt(token: number, href: string, started: number): Promise<void> {
    let report: ImportWatchReport;
    try {
      report = await host.read();
    } catch {
      report = { type: IMPORT_WATCH, kind: "unavailable" };
    }
    if (token !== generation || host.href() !== href) return;
    host.send(report);
    if (report.kind !== "pending") return;
    const elapsed = host.now() - started;
    if (elapsed >= IMPORT_RETRY_WINDOW_MS) return;
    const delay = Math.min(IMPORT_RETRY_INTERVAL_MS, IMPORT_RETRY_WINDOW_MS - elapsed);
    cancelTimer = host.schedule(delay, () => {
      if (token !== generation || host.href() !== href) return;
      if (host.now() - started >= IMPORT_RETRY_WINDOW_MS) return;
      void attempt(token, href, started);
    });
  }

  return { refresh, stop };
}

export function listenToNavigation(refresh: () => void): void {
  const navigation = (globalThis as { navigation?: NavigationEvents }).navigation;
  navigation?.addEventListener("navigatesuccess", refresh);
}

type NavigationEvents = {
  addEventListener(type: "navigatesuccess", listener: () => void): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
