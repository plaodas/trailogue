import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { classifyPage } from "../src/capture/page";
import { CAPTURE_REQUEST } from "../src/capture/request";

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id !== undefined && tab.url && classifyPage(tab.url)) {
      try {
        await browser.tabs.sendMessage(tab.id, { type: CAPTURE_REQUEST });
      } catch {
        // 取得元タブを開閉せず、応答できないタブでもダッシュボードだけ開く。
      }
    }
    await openDashboard();
  });
});

async function openDashboard(): Promise<void> {
  const url = browser.runtime.getURL("/dashboard.html");
  const [existing] = await browser.tabs.query({ url });
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await browser.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await browser.tabs.create({ url });
}
