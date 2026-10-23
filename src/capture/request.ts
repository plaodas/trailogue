import type { CaptureFailureCode, ParseResult, RawCapture } from "../domain/types";

export const CAPTURE_REQUEST = "trailogue:capture";

const FAILURE_CODES = new Set<CaptureFailureCode>([
  "login_required",
  "not_ready",
  "empty_conversation",
  "incomplete_conversation",
  "unrecognized_structure",
  "unsupported_page",
]);

export function isCaptureRequest(message: unknown): boolean {
  return isRecord(message) && message.type === CAPTURE_REQUEST;
}

export function isParseResult(value: unknown): value is ParseResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok === false) {
    return typeof value.code === "string" && FAILURE_CODES.has(value.code as CaptureFailureCode);
  }
  return isRawCapture(value.capture);
}

function isRawCapture(value: unknown): value is RawCapture {
  if (!isRecord(value)) return false;
  if (value.provider !== "copilot" && value.provider !== "chatgpt") return false;
  if (value.sourceKind !== "conversation" && value.sourceKind !== "shared") return false;
  if (typeof value.sourceUrl !== "string" || typeof value.sourceId !== "string") return false;
  if (typeof value.parserVersion !== "string") return false;
  if (value.title !== null && typeof value.title !== "string") return false;
  if (!Array.isArray(value.messages) || !value.messages.every(isRawMessage)) return false;
  return true;
}

function isRawMessage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.ordinal !== "number" || !Number.isInteger(value.ordinal)) return false;
  if (value.role !== "user" && value.role !== "assistant" && value.role !== "unknown") return false;
  if (typeof value.content !== "string") return false;
  if (value.providerMessageId !== undefined && typeof value.providerMessageId !== "string") {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
