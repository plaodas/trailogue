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
  deleteRecord: "削除",
  confirmDelete: (title: string, provider: string) =>
    `「${title}」（${provider}）をフォルダとブラウザ内から消します。`,
  reloading: "ページを読み直して取得しています",
  capturing: "会話を取得しています",
  emptyMessages: (count: number) => `空の本文が${count}件あります。`,
  batchDone: "サイドバーの会話を取り込みました",
  batchCancelled: "取り込みを止めています",
  batchStart: "サイドバーの会話を順に取り込む",
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
} as const;

export function failureCopy(code: CaptureFailureCode | null): string {
  if (code === "empty_conversation") return copy.empty;
  if (code === "incomplete_conversation") return copy.incomplete;
  return copy.unrecognized;
}
