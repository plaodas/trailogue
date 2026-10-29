import type { CaptureFailureCode } from "../domain/types";

export const copy = {
  unsupportedBrowser: "Trailogue は Chrome と Edge で動きます。Brave では使えません。",
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
  deleteRecord: "削除",
  confirmDelete: (title: string, provider: string) =>
    `「${title}」（${provider}）をフォルダとブラウザ内から消します。`,
  reloading: "ページを読み直して取得しています",
  capturing: "会話を取得しています",
  emptyMessages: (count: number) => `空の本文が${count}件あります。`,
  batchDone: "サイドバーの会話を取り込みました",
  batchCancelled: "取り込みを止めています",
  batchStart: "Copilotのサイドバーの会話を順に取り込む",
  batchResume: "続きから",
  batchBack: "一覧へ戻る",
  batchPaused: "連続して構造を読めなかったので止めています",
  batchTabClosed: "会話タブが閉じたので止めています",
  batchEmpty: "サイドバーに会話の識別子がありません。Copilotの会話を開いてから実行する",
  batchNoTab: "Copilotの会話タブでサイドバーを開いてから実行する",
  batchFolder: "記録フォルダを選ぶと取り込みを始められます",
  batchProgress: (done: number, total: number) => `${done}/${total}`,
  batchStored: (count: number) => `保存 ${count}`,
  batchSkipped: (count: number) => `同じ内容 ${count}`,
  batchFailed: (count: number) => `失敗 ${count}`,
  batchFailedHeading: "取り込めなかった会話",
  exportPick: "ChatGPTのExportを取り込む",
  exportConfirm: "このExportを保存する",
  exportCancel: "取り込むのをやめる",
  exportExisting: "同じ会話の記録が既にあります",
  exportFileUnread: "このファイルから conversations.json を読めませんでした",
  exportNone: "読めた会話がありません。",
  exportIncomplete: "この会話の全発言を確認できないので保存しません。",
  exportEmpty: "本文のある発言が無いので保存しません。",
  exportUnrecognized: "この会話の構造を読めないので保存しません。",
  exportStored: (count: number) => `保存 ${count}`,
  exportSkipped: (count: number) => `同じ内容 ${count}`,
  exportFailed: (count: number) => `失敗 ${count}`,
  generationExtended: "増えた",
  generationShortened: "表示が短い",
  generationWindow: "途中の窓",
  generationDiverged: "内容が変わった",
} as const;

export function generationCopy(reason: "extended" | "shortened" | "window" | "diverged"): string {
  if (reason === "extended") return copy.generationExtended;
  if (reason === "shortened") return copy.generationShortened;
  if (reason === "window") return copy.generationWindow;
  return copy.generationDiverged;
}

export function exportFailureCopy(
  code: "incomplete_conversation" | "empty_conversation" | "unrecognized_structure",
): string {
  if (code === "incomplete_conversation") return copy.exportIncomplete;
  if (code === "empty_conversation") return copy.exportEmpty;
  return copy.exportUnrecognized;
}

export function failureCopy(code: CaptureFailureCode | null): string {
  if (code === "empty_conversation") return copy.empty;
  if (code === "incomplete_conversation") return copy.incomplete;
  return copy.unrecognized;
}
