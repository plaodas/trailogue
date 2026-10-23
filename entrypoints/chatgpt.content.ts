import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { isCaptureRequest } from "../src/capture/request";
import { chatgptConversationIds, isSidebarListRequest } from "../src/capture/sidebar";
import { parse } from "../src/providers/chatgpt/adapter";

export default defineContentScript({
  matches: [
    "https://chatgpt.com/c/*",
    "https://chatgpt.com/share/*",
  ],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isSidebarListRequest(message)) {
        sendResponse(chatgptConversationIds(document));
        return;
      }
      if (!isCaptureRequest(message)) return;
      sendResponse(
        parse(document, location.href, {
          documentReady: document.readyState !== "loading",
        }),
      );
    });
  },
});
