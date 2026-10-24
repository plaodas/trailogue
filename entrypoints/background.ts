import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { isBraveBrandList } from "../src/capture/browserSupport";
import { createCaptureLauncher } from "../src/capture/launch";
import { isDashboardReady } from "../src/capture/status";
import { copy } from "../src/ui/copy";

export default defineBackground(() => {
  const blocked = isBraveBrandList(clientBrands());
  const launcher = createCaptureLauncher({
    openDashboard,
    publish(status) {
      void browser.runtime.sendMessage(status).catch(() => undefined);
    },
  });

  if (blocked) {
    void browser.action.setBadgeText({ text: "!" });
    void browser.action.setTitle({ title: copy.unsupportedBrowser });
    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason !== "install") return;
      void openDashboard();
    });
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isDashboardReady(message)) return;
    sendResponse(launcher.status());
  });

  browser.action.onClicked.addListener((tab) => {
    if (blocked) {
      void openDashboard();
      return;
    }
    void launcher.click({ id: tab.id, url: tab.url });
  });
});

function clientBrands(): readonly { brand: string }[] | undefined {
  const data = (navigator as Navigator & { userAgentData?: { brands?: readonly { brand: string }[] } })
    .userAgentData;
  return data?.brands;
}

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
