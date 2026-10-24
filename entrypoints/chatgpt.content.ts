import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createImportWatcher, listenToNavigation, readImportReport } from "../src/capture/importWatch";
import { isCaptureRequest } from "../src/capture/request";
import { parse } from "../src/providers/chatgpt/adapter";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isCaptureRequest(message)) return;
      sendResponse(
        parse(document, location.href, {
          documentReady: document.readyState !== "loading",
        }),
      );
    });

    const watch = createImportWatcher({
      href: () => location.href,
      read: () => readImportReport(location.href, () => parse(document, location.href, {
        documentReady: document.readyState !== "loading",
      })),
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
  },
});
