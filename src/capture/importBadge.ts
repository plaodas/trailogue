import { relateImport, type ImportRelation } from "../domain/importStatus";
import type { ProviderId } from "../domain/types";
import type { ImportWatchReport } from "./importWatch";

export const EXTENSION_TITLE = "答えではなく、たどり着き方を残す。";

export type FolderPermission = "ready" | "needs_permission" | "missing";

export type ImportBadge = {
  text: string;
  title: string;
  color: string | null;
};

const BADGES = {
  same: { text: "済", title: "取り込み済", color: "#1f7a4d" },
  absent: { text: "未", title: "未取り込み", color: "#4d6273" },
  pending: { text: "…", title: "確認中", color: "#5e5e5e" },
  unavailable: { text: "?", title: "照合できない", color: "#5e5e5e" },
  unconfirmed: { text: "?", title: "未確認", color: "#5e5e5e" },
  clear: { text: "", title: EXTENSION_TITLE, color: null },
  extended: { text: "差", title: "増えた", color: "#8a5a00" },
  shortened: { text: "差", title: "表示が短い", color: "#8a5a00" },
  window: { text: "差", title: "途中の窓", color: "#8a5a00" },
  diverged: { text: "差", title: "内容が変わった", color: "#8a5a00" },
} as const;

export function importBadge(
  status: ImportRelation | "pending" | "unavailable" | "unconfirmed" | "clear",
): ImportBadge {
  if (typeof status === "string") return { ...BADGES[status] };
  if (status.kind === "different") return { ...BADGES[status.reason] };
  return { ...BADGES[status.kind] };
}

export function selectImportBadge(input: {
  kind: ImportWatchReport["kind"];
  permission: FolderPermission;
  folderAligned: boolean;
  relation: ImportRelation | null;
}): ImportBadge {
  if (input.kind !== "ready") return importBadge(input.kind);
  if (input.permission !== "ready" || !input.folderAligned || !input.relation) {
    return importBadge("unconfirmed");
  }
  return importBadge(input.relation);
}

export function createImportBadgeController(host: {
  permission: () => Promise<FolderPermission>;
  align: () => Promise<void>;
  folderAligned: () => Promise<boolean>;
  generations: (provider: ProviderId, sourceId: string) => Promise<string[][]>;
  show: (tabId: number, badge: ImportBadge) => Promise<void>;
}): { apply: (tabId: number, report: ImportWatchReport) => Promise<void> } {
  let aligning: Promise<boolean> | null = null;

  function alignedFromFolder(): Promise<boolean> {
    if (aligning) return aligning;
    aligning = host.align()
      .then(() => host.folderAligned())
      .then((aligned) => {
        if (!aligned) aligning = null;
        return aligned;
      })
      .catch(() => {
        aligning = null;
        return false;
      });
    return aligning;
  }

  return {
    async apply(tabId, report) {
      if (report.kind !== "ready") {
        await host.show(tabId, importBadge(report.kind));
        return;
      }
      const permission = await host.permission();
      const folderAligned = permission === "ready" ? await alignedFromFolder() : false;
      const relation = permission === "ready" && folderAligned
        ? relateImport(report.fingerprints, await host.generations(report.provider, report.sourceId))
        : null;
      await host.show(tabId, selectImportBadge({
        kind: report.kind,
        permission,
        folderAligned,
        relation,
      }));
    },
  };
}
