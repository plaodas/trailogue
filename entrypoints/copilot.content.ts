import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { isCaptureRequest } from "../src/capture/request";
import { parse } from "../src/providers/copilot/adapter";
import {
  pagePath,
  retainHydrationScript,
  type RetainedHydration,
} from "../src/providers/copilot/hydration";

export default defineContentScript({
  matches: [
    "https://copilot.cloud.microsoft/chat/conversation/*",
    "https://copilot.cloud.microsoft/chat/share/*",
  ],
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
      if (!isCaptureRequest(message)) return;
      const path = pagePath(location.href);
      sendResponse(
        parse(document, location.href, {
          retainedScriptText: retained && retained.path === path ? retained.text : undefined,
          retainedPath: retained?.path,
          documentReady: document.readyState !== "loading",
        }),
      );
    });
  },
});