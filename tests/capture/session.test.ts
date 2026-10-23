import { describe, expect, it } from "vitest";
import { transition, type SessionEvent, type SessionState } from "../../src/capture/session";

describe("transition", () => {
  it("follows the capture session", () => {
    let state: SessionState = "idle";
    const steps: Array<[SessionEvent, SessionState]> = [
      [{ type: "begin", allowed: false }, "unsupported"],
      [{ type: "dismiss" }, "idle"],
      [{ type: "begin", allowed: true }, "inspecting"],
      [{ type: "result", code: "login_required" }, "awaiting_login"],
      [{ type: "retry" }, "inspecting"],
      [{ type: "result", code: "not_ready" }, "waiting_for_dom"],
      [{ type: "retry" }, "inspecting"],
      [{ type: "result", code: "empty_conversation" }, "failed"],
      [{ type: "dismiss" }, "idle"],
      [{ type: "begin", allowed: true }, "inspecting"],
      [{ type: "result", code: "incomplete_conversation" }, "failed"],
      [{ type: "dismiss" }, "idle"],
      [{ type: "begin", allowed: true }, "inspecting"],
      [{ type: "result", code: "unrecognized_structure" }, "failed"],
      [{ type: "dismiss" }, "idle"],
      [{ type: "begin", allowed: true }, "inspecting"],
      [{ type: "result", code: "unsupported_page" }, "unsupported"],
      [{ type: "dismiss" }, "idle"],
      [{ type: "begin", allowed: true }, "inspecting"],
      [{ type: "captured" }, "preview"],
      [{ type: "same_hash" }, "duplicate"],
      [{ type: "open_existing" }, "saved"],
    ];

    for (const [event, expected] of steps) {
      state = transition(state, event);
      expect(state).toBe(expected);
    }
  });

  it("keeps a changed conversation as a new preview and returns after a failed save", () => {
    expect(transition("preview", { type: "save" })).toBe("saving");
    expect(transition("saving", { type: "store_failed" })).toBe("preview");
    expect(transition("saving", { type: "stored" })).toBe("saved");
    expect(transition("preview", { type: "discard" })).toBe("idle");
  });

  it("waits for the user during sign-in and cancels without failing", () => {
    expect(transition("awaiting_login", { type: "cancel" })).toBe("cancelled");
    expect(transition("waiting_for_dom", { type: "tab_closed" })).toBe("cancelled");
    expect(transition("inspecting", { type: "tab_closed" })).toBe("cancelled");
    expect(transition("cancelled", { type: "dismiss" })).toBe("idle");
    expect(transition("awaiting_login", { type: "result", code: "login_required" })).toBe(
      "awaiting_login",
    );
  });

  it("ignores events from the wrong state", () => {
    expect(transition("idle", { type: "captured" })).toBe("idle");
    expect(transition("preview", { type: "retry" })).toBe("preview");
    expect(transition("saved", { type: "discard" })).toBe("saved");
    expect(transition("failed", { type: "save" })).toBe("failed");
  });
});
