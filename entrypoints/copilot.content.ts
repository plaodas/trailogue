import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { isCaptureRequest } from "../src/capture/request";
import { parse } from "../src/providers/copilot/adapter";

export default defineContentScript({
  matches: [
    "https://copilot.cloud.microsoft/chat/conversation/*",
    "https://copilot.cloud.microsoft/chat/share/*",
  ],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isCaptureRequest(message)) return;
      sendResponse(parse(document, location.href));
    });
  },
});
