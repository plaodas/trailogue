export type TabEvents = {
  reload(tabId: number): Promise<void> | void;
  onUpdated: {
    addListener(listener: (tabId: number, info: { status?: string }) => void): void;
    removeListener(listener: (tabId: number, info: { status?: string }) => void): void;
  };
  onRemoved: {
    addListener(listener: (tabId: number) => void): void;
    removeListener(listener: (tabId: number) => void): void;
  };
};

export type ReloadResult = "complete" | "closed" | "stopped";

export function reloadAndWait(
  tabId: number,
  tabs: TabEvents,
): { done: Promise<ReloadResult>; stop: () => void } {
  let settled = false;
  let sawLoading = false;
  let resolveDone: (result: ReloadResult) => void = () => {};
  const done = new Promise<ReloadResult>((resolve) => {
    resolveDone = resolve;
  });

  const finish = (result: ReloadResult) => {
    if (settled) return;
    settled = true;
    tabs.onUpdated.removeListener(onUpdated);
    tabs.onRemoved.removeListener(onRemoved);
    resolveDone(result);
  };

  const onUpdated = (id: number, info: { status?: string }) => {
    if (id !== tabId) return;
    if (info.status === "loading") sawLoading = true;
    if (info.status === "complete" && sawLoading) finish("complete");
  };

  const onRemoved = (id: number) => {
    if (id === tabId) finish("closed");
  };

  tabs.onUpdated.addListener(onUpdated);
  tabs.onRemoved.addListener(onRemoved);
  try {
    Promise.resolve(tabs.reload(tabId)).catch(() => finish("closed"));
  } catch {
    finish("closed");
  }

  return {
    done,
    stop() {
      finish("stopped");
    },
  };
}
