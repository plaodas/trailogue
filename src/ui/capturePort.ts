import type { DashboardStatus } from "../capture/status";
import type { ParseResult } from "../domain/types";

export type CaptureRead = ParseResult | { closed: true };

export type CapturePort = {
  watch(listener: (status: DashboardStatus) => void): () => void;
  read(tabId: number): Promise<CaptureRead>;
};
