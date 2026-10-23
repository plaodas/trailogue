import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createCaptureLauncher } from "../src/capture/launch";
import { isDashboardReady } from "../src/capture/status";

export default defineBackground(() => {
  const launcher = createCaptureLauncher({
    openDashboard,
    publish(status) {
      void browser.runtime.sendMessage(status).catch(() => undefined);
    },
    tabs: browser.tabs,
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isDashboardReady(message)) return;
    sendResponse(launcher.status());
  });

  browser.action.onClicked.addListener((tab) => {
    void launcher.click({ id: tab.id, url: tab.url });
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
