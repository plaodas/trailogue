import { describe, expect, it } from "vitest";
import { isBraveBrandList } from "../../src/capture/browserSupport";

describe("isBraveBrandList", () => {
  it("is true when a brand is Brave", () => {
    expect(isBraveBrandList([{ brand: "Chromium" }, { brand: "Brave" }])).toBe(true);
  });

  it("is false for Chrome brands", () => {
    expect(isBraveBrandList([{ brand: "Google Chrome" }, { brand: "Chromium" }])).toBe(false);
  });

  it("is false when brands are missing", () => {
    expect(isBraveBrandList(undefined)).toBe(false);
  });
});
