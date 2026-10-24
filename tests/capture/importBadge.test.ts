import { describe, expect, it, vi } from "vitest";
import {
  createImportBadgeController,
  importBadge,
  selectImportBadge,
} from "../../src/capture/importBadge";
import { IMPORT_WATCH, type ImportWatchReport } from "../../src/capture/importWatch";

const ready: ImportWatchReport = {
  type: IMPORT_WATCH,
  kind: "ready",
  provider: "chatgpt",
  sourceId: "conversation-1",
  fingerprints: ["saved"],
};

describe("import badges", () => {
  it("names the six states and the four differences", () => {
    expect(importBadge({ kind: "same" })).toMatchObject({ text: "済", title: "取り込み済" });
    expect(importBadge({ kind: "absent" })).toMatchObject({ text: "未", title: "未取り込み" });
    expect(importBadge("pending")).toMatchObject({ text: "…", title: "確認中" });
    expect(importBadge("unavailable")).toMatchObject({ text: "?", title: "照合できない" });
    expect(importBadge("unconfirmed")).toMatchObject({ text: "?", title: "未確認" });
    expect(importBadge("clear").text).toBe("");
    expect(importBadge({ kind: "different", reason: "extended" })).toMatchObject({ text: "差", title: "増えた" });
    expect(importBadge({ kind: "different", reason: "shortened" })).toMatchObject({
      text: "差",
      title: "表示が短い",
    });
    expect(importBadge({ kind: "different", reason: "window" })).toMatchObject({ text: "差", title: "途中の窓" });
    expect(importBadge({ kind: "different", reason: "diverged" })).toMatchObject({
      text: "差",
      title: "内容が変わった",
    });
  });

  it("stays unconfirmed when the folder is unread, even if a relation matches", () => {
    expect(selectImportBadge({
      kind: "ready",
      permission: "needs_permission",
      folderAligned: true,
      relation: { kind: "same" },
    })).toMatchObject({ title: "未確認" });
    expect(selectImportBadge({
      kind: "ready",
      permission: "ready",
      folderAligned: false,
      relation: { kind: "absent" },
    })).toMatchObject({ title: "未確認" });
  });
});

describe("createImportBadgeController", () => {
  it("does not read the cache when the folder permission is missing", async () => {
    const align = vi.fn();
    const generations = vi.fn(async () => [["saved"]]);
    const shown: string[] = [];
    const controller = createImportBadgeController({
      permission: async () => "missing",
      align,
      folderAligned: async () => true,
      generations,
      show: async (_tabId, badge) => { shown.push(badge.title); },
    });

    await controller.apply(4, ready);

    expect(shown).toEqual(["未確認"]);
    expect(align).not.toHaveBeenCalled();
    expect(generations).not.toHaveBeenCalled();
  });

  it("aligns the folder once, then compares fingerprints", async () => {
    let aligned = false;
    const align = vi.fn(async () => {
      aligned = true;
    });
    const shown: string[] = [];
    const controller = createImportBadgeController({
      permission: async () => "ready",
      align,
      folderAligned: async () => aligned,
      generations: async () => [["a", "b"]],
      show: async (_tabId, badge) => { shown.push(badge.title); },
    });
    const current: ImportWatchReport = { ...ready, fingerprints: ["a"] };

    await controller.apply(4, current);
    await controller.apply(4, current);

    expect(align).toHaveBeenCalledTimes(1);
    expect(shown).toEqual(["表示が短い", "表示が短い"]);
  });

  it("retries alignment after a failure", async () => {
    let fail = true;
    let aligned = false;
    const align = vi.fn(async () => {
      if (fail) throw new Error("unavailable");
      aligned = true;
    });
    const shown: string[] = [];
    const controller = createImportBadgeController({
      permission: async () => "ready",
      align,
      folderAligned: async () => aligned,
      generations: async () => [],
      show: async (_tabId, badge) => { shown.push(badge.title); },
    });

    await controller.apply(4, ready);
    fail = false;
    await controller.apply(4, ready);

    expect(align).toHaveBeenCalledTimes(2);
    expect(shown).toEqual(["未確認", "未取り込み"]);
  });
});
