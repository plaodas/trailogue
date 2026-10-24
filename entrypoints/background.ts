import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createFileSystemArchive } from "../src/archive/fileSystemArchive";
import { isBraveBrandList } from "../src/capture/browserSupport";
import { createImportBadgeController, type ImportBadge } from "../src/capture/importBadge";
import { isImportWatchReport } from "../src/capture/importWatch";
import { createCaptureLauncher } from "../src/capture/launch";
import { isDashboardReady } from "../src/capture/status";
import { messageFingerprints } from "../src/domain/importStatus";
import { alignCache } from "../src/storage/alignCache";
import { openDatabase } from "../src/storage/db";
import { createRepository } from "../src/storage/repository";
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

  const database = openDatabase();
  const repository = createRepository(database);
  const archive = createFileSystemArchive(database);
  const badges = createImportBadgeController({
    permission: async () => {
      try {
        return await archive.connection();
      } catch {
        return "missing";
      }
    },
    align: async () => {
      const listing = await archive.list();
      await alignCache(repository, listing.conversations);
    },
    folderAligned: () => repository.isFolderAligned(),
    generations: async (provider, sourceId) => {
      const rows = await repository.findBySource(sourceId);
      const matched = rows.filter((row) => row.provider === provider);
      const generations = [];
      for (const row of matched) generations.push(await messageFingerprints(row.messages));
      return generations;
    },
    show: showBadge,
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isDashboardReady(message)) {
      sendResponse(launcher.status());
      return;
    }
    if (blocked || !isImportWatchReport(message)) return;
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    void badges.apply(tabId, message);
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

async function showBadge(tabId: number, badge: ImportBadge): Promise<void> {
  await browser.action.setBadgeText({ text: badge.text, tabId });
  if (badge.color) {
    await browser.action.setBadgeBackgroundColor({ color: badge.color, tabId });
  }
  await browser.action.setTitle({ title: badge.title, tabId });
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
