import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createImportWatcher, listenToNavigation, readImportReport } from "../src/capture/importWatch";
import { isCaptureRequest } from "../src/capture/request";
import { copilotConversationIds, isSidebarListRequest } from "../src/capture/sidebar";
import { parse } from "../src/providers/copilot/adapter";
import {
  pagePath,
  retainHydrationScript,
  type RetainedHydration,
} from "../src/providers/copilot/hydration";

export default defineContentScript({
  matches: ["https://copilot.cloud.microsoft/*"],
  runAt: "document_start",
  main() {
    let retained: RetainedHydration | undefined;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const path = pagePath(location.href);
          if (!path) continue;
          retained = retainHydrationScript(retained, node, path);
        }
      }
    });

    const root = document.documentElement ?? document;
    const initialPath = pagePath(location.href);
    if (initialPath) retained = retainHydrationScript(retained, root, initialPath);
    observer.observe(root, { childList: true, subtree: true });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isSidebarListRequest(message)) {
        sendResponse(copilotConversationIds(document));
        return;
      }
      if (!isCaptureRequest(message)) return;
      sendResponse(parseCopilot());
    });

    const watch = createImportWatcher({
      href: () => location.href,
      read: () => readImportReport(location.href, parseCopilot),
      send: (report) => {
        void browser.runtime.sendMessage(report).catch(() => undefined);
      },
      now: () => Date.now(),
      schedule: (delayMs, run) => {
        const timer = setTimeout(run, delayMs);
        return () => clearTimeout(timer);
      },
    });
    listenToNavigation(() => watch.refresh());
    watch.refresh();

    function parseCopilot() {
      const path = pagePath(location.href);
      return parse(document, location.href, {
        retainedScriptText: retained && retained.path === path ? retained.text : undefined,
        retainedPath: retained?.path,
        documentReady: document.readyState !== "loading",
      });
    }
  },
});