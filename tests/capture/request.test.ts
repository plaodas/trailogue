import { describe, expect, it } from "vitest";
import { CAPTURE_REQUEST, isCaptureRequest } from "../../src/capture/request";

describe("isCaptureRequest", () => {
  it("accepts only an explicit capture request", () => {
    expect(isCaptureRequest({ type: CAPTURE_REQUEST })).toBe(true);
    expect(isCaptureRequest({ type: "trailogue:other" })).toBe(false);
    expect(isCaptureRequest(null)).toBe(false);
    expect(isCaptureRequest("trailogue:capture")).toBe(false);
  });
});
