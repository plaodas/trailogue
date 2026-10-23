import type { CaptureFailureCode } from "../domain/types";

export const copy = {
  unsupported: "CopilotまたはChatGPTの対応会話タブで実行する",
  login: "現在のタブでサインインし、会話を表示する",
  waiting: "現在のタブで会話の表示を待っている",
  waitingExpired: "会話の表示を待っています",
  preview: "発言の全文プレビュー",
  duplicate: "同じ軌跡は保存済みであり、既存の記録へ移れる",
  changed: "同じ会話の別の記録として残せる。以前の記録は削除しない",
  empty: "会話を読めなかったので保存していない",
  incomplete: "仮想化などにより全発言を確認できず、保存していない",
  unrecognized: "この版のadapterでは会話ページの構造を読めなかった",
  cancelled: "取得を中断した",
  saveFailed: "記録はまだこの画面にある",
  folderMissing: "記録フォルダが未選択です。この一覧はブラウザの中にあります。",
  folderClosed: "記録フォルダを開き直すと、ファイルから一覧を戻します。",
  chooseFolder: "記録フォルダを選ぶ",
  reopenFolder: "記録フォルダを開く",
  unreadable: (count: number) => `読めなかったファイルが${count}件あります。`,
  reloading: "ページを読み直して取得しています",
  capturing: "会話を取得しています",
  emptyMessages: (count: number) => `空の本文が${count}件あります。`,
} as const;

export function failureCopy(code: CaptureFailureCode | null): string {
  if (code === "empty_conversation") return copy.empty;
  if (code === "incomplete_conversation") return copy.incomplete;
  return copy.unrecognized;
}
