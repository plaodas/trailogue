import { browser } from "wxt/browser";
import {
  copilotConversationUrl,
  isConversationIdList,
  SIDEBAR_LIST_REQUEST,
} from "../capture/sidebar";

const NAVIGATION_TIMEOUT_MS = 60_000;

export type SidebarBatchPort = {
  findTab(): Promise<number | null>;
  listIds(tabId: number): Promise<string[] | "closed">;
  open(tabId: number, id: string): Promise<"complete" | "closed" | "unready">;
};

export function createSidebarBatch(): SidebarBatchPort {
  return {
    async findTab() {
      const tabs = await browser.tabs.query({
        url: "https://copilot.cloud.microsoft/chat/conversation/*",
      });
      const active = tabs.find((tab) => tab.active && tab.id !== undefined);
      if (active?.id !== undefined) return active.id;
      return tabs.find((tab) => tab.id !== undefined)?.id ?? null;
    },
    async listIds(tabId) {
      try {
        await browser.tabs.get(tabId);
      } catch {
        return "closed";
      }
      try {
        const response: unknown = await browser.tabs.sendMessage(tabId, {
          type: SIDEBAR_LIST_REQUEST,
        });
        if (!isConversationIdList(response)) return [];
        return response;
      } catch {
        try {
          await browser.tabs.get(tabId);
        } catch {
          return "closed";
        }
        return [];
      }
    },
    async open(tabId, id) {
      const url = copilotConversationUrl(id);
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url && sameConversation(tab.url, url)) return "complete";
      } catch {
        return "closed";
      }
      const navigation = watchNavigation(tabId);
      try {
        await browser.tabs.update(tabId, { url });
      } catch {
        navigation.stop();
        return "closed";
      }
      return navigation.done;
    },
  };
}

export const extensionBatch = createSidebarBatch();

function sameConversation(current: string, next: string): boolean {
  try {
    const left = new URL(current);
    const right = new URL(next);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return false;
  }
}

function watchNavigation(tabId: number): {
  done: Promise<"complete" | "closed" | "unready">;
  stop: () => void;
} {
  let settled = false;
  let sawLoading = false;
  let finish: (result: "complete" | "closed" | "unready") => void = () => {};
  const done = new Promise<"complete" | "closed" | "unready">((resolve) => {
    finish = resolve;
  });
  const settle = (result: "complete" | "closed" | "unready") => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    browser.tabs.onUpdated.removeListener(onUpdated);
    browser.tabs.onRemoved.removeListener(onRemoved);
    finish(result);
  };
  const onUpdated = (id: number, info: { status?: string }) => {
    if (id !== tabId) return;
    if (info.status === "loading") sawLoading = true;
    if (info.status === "complete" && sawLoading) settle("complete");
  };
  const onRemoved = (id: number) => {
    if (id === tabId) settle("closed");
  };
  const timer = window.setTimeout(() => settle("unready"), NAVIGATION_TIMEOUT_MS);
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.tabs.onRemoved.addListener(onRemoved);
  return { done, stop: () => settle("closed") };
}
