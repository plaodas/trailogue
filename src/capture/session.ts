import type { CaptureFailureCode } from "../domain/types";

export type SessionState =
  | "idle"
  | "unsupported"
  | "inspecting"
  | "awaiting_login"
  | "waiting_for_dom"
  | "failed"
  | "preview"
  | "duplicate"
  | "saving"
  | "saved"
  | "cancelled";

export type SessionEvent =
  | { type: "begin"; allowed: boolean }
  | { type: "result"; code: CaptureFailureCode }
  | { type: "captured" }
  | { type: "same_hash" }
  | { type: "save" }
  | { type: "discard" }
  | { type: "show_list" }
  | { type: "stored" }
  | { type: "store_failed" }
  | { type: "open_existing" }
  | { type: "retry" }
  | { type: "cancel" }
  | { type: "tab_closed" }
  | { type: "dismiss" };

const READING_FAILURES = new Set<CaptureFailureCode>([
  "empty_conversation",
  "incomplete_conversation",
  "unrecognized_structure",
]);

export function transition(state: SessionState, event: SessionEvent): SessionState {
  if (state === "idle" && event.type === "begin") {
    return event.allowed ? "inspecting" : "unsupported";
  }
  if (state === "inspecting" && event.type === "result") {
    if (event.code === "login_required") return "awaiting_login";
    if (event.code === "not_ready") return "waiting_for_dom";
    if (event.code === "unsupported_page") return "unsupported";
    if (READING_FAILURES.has(event.code)) return "failed";
  }
  if (state === "inspecting" && event.type === "captured") return "preview";
  if (state === "inspecting" && event.type === "tab_closed") return "cancelled";
  if (state === "inspecting" && event.type === "show_list") return "idle";
  if (
    (state === "awaiting_login" || state === "waiting_for_dom") &&
    event.type === "retry"
  ) {
    return "inspecting";
  }
  if (
    (state === "awaiting_login" || state === "waiting_for_dom") &&
    (event.type === "cancel" || event.type === "tab_closed")
  ) {
    return "cancelled";
  }
  if (
    (state === "failed" || state === "unsupported" || state === "cancelled") &&
    event.type === "dismiss"
  ) {
    return "idle";
  }
  if (state === "preview" && event.type === "same_hash") return "duplicate";
  if (state === "preview" && event.type === "save") return "saving";
  if (state === "preview" && event.type === "discard") return "idle";
  if (state === "preview" && event.type === "show_list") return "idle";
  if (state === "duplicate" && event.type === "show_list") return "idle";
  if (state === "saving" && event.type === "stored") return "saved";
  if (state === "saving" && event.type === "store_failed") return "preview";
  if (state === "duplicate" && event.type === "open_existing") return "saved";
  return state;
}
