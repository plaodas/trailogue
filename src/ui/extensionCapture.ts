import { browser } from "wxt/browser";
import { CAPTURE_REQUEST, isParseResult } from "../capture/request";
import { DASHBOARD_READY, isDashboardStatus } from "../capture/status";
import type { CapturePort, CaptureRead } from "./capturePort";

export const extensionCapture: CapturePort = {
  watch(listener) {
    const onMessage = (message: unknown) => {
      if (isDashboardStatus(message)) listener(message);
    };
    browser.runtime.onMessage.addListener(onMessage);
    void browser.runtime
      .sendMessage({ type: DASHBOARD_READY })
      .then((response: unknown) => {
        if (isDashboardStatus(response)) listener(response);
      })
      .catch(() => undefined);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
    };
  },
  async read(tabId): Promise<CaptureRead> {
    try {
      await browser.tabs.get(tabId);
    } catch {
      return { closed: true };
    }
    try {
      const response: unknown = await browser.tabs.sendMessage(tabId, { type: CAPTURE_REQUEST });
      if (isParseResult(response)) return response;
      return { ok: false, code: "not_ready" };
    } catch {
      try {
        await browser.tabs.get(tabId);
      } catch {
        return { closed: true };
      }
      return { ok: false, code: "not_ready" };
    }
  },
};
