import { describe, expect, it } from "vitest";
import { CAPTURE_REQUEST, isCaptureRequest, isParseResult } from "../../src/capture/request";

describe("isCaptureRequest", () => {
  it("accepts only an explicit capture request", () => {
    expect(isCaptureRequest({ type: CAPTURE_REQUEST })).toBe(true);
    expect(isCaptureRequest({ type: "trailogue:other" })).toBe(false);
    expect(isCaptureRequest(null)).toBe(false);
    expect(isCaptureRequest("trailogue:capture")).toBe(false);
  });

  it("accepts a capture result and rejects a partial payload", () => {
    expect(
      isParseResult({
        ok: true,
        capture: {
          provider: "chatgpt",
          sourceUrl: "https://chatgpt.com/c/conversation-1",
          sourceId: "conversation-1",
          sourceKind: "conversation",
          title: null,
          parserVersion: "chatgpt-1",
          messages: [{ ordinal: 0, role: "user", content: "問い" }],
        },
      }),
    ).toBe(true);
    expect(isParseResult({ ok: false, code: "not_ready" })).toBe(true);
    expect(isParseResult({ ok: false, code: "other" })).toBe(false);
    expect(isParseResult({ ok: true, capture: { provider: "chatgpt" } })).toBe(false);
  });
});
