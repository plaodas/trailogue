import { describe, expect, it, vi } from "vitest";
import { reloadAndWait, type TabEvents } from "../../src/capture/reload";

describe("reloadAndWait", () => {
  it("resolves after loading and the next complete", async () => {
    const tabs = fakeTabs();
    const reload = reloadAndWait(7, tabs.events);
    tabs.emit(7, "complete");
    await Promise.resolve();
    expect(tabs.reload).toHaveBeenCalledTimes(1);
    tabs.emit(7, "loading");
    tabs.emit(7, "complete");
    await expect(reload.done).resolves.toBe("complete");
    expect(tabs.updated.size).toBe(0);
  });

  it("resolves closed when the tab goes away or reload fails", async () => {
    const removed = fakeTabs();
    const gone = reloadAndWait(7, removed.events);
    removed.remove(7);
    await expect(gone.done).resolves.toBe("closed");

    const failing = fakeTabs();
    failing.reload.mockImplementation(() => Promise.reject(new Error("reload failed")));
    const failed = reloadAndWait(7, failing.events);
    await expect(failed.done).resolves.toBe("closed");
  });

  it("stops listening when a newer reload takes over", async () => {
    const tabs = fakeTabs();
    tabs.reload.mockImplementation(() => new Promise<void>(() => {}));
    const reload = reloadAndWait(7, tabs.events);
    reload.stop();
    tabs.emit(7, "loading");
    tabs.emit(7, "complete");
    await expect(reload.done).resolves.toBe("stopped");
  });
});

function fakeTabs() {
  const updated = new Set<(tabId: number, info: { status?: string }) => void>();
  const removed = new Set<(tabId: number) => void>();
  const reload = vi.fn(async () => {});
  const events: TabEvents = {
    reload,
    onUpdated: {
      addListener(listener) {
        updated.add(listener);
      },
      removeListener(listener) {
        updated.delete(listener);
      },
    },
    onRemoved: {
      addListener(listener) {
        removed.add(listener);
      },
      removeListener(listener) {
        removed.delete(listener);
      },
    },
  };
  return {
    events,
    reload,
    updated,
    emit(tabId: number, status: string) {
      for (const listener of updated) listener(tabId, { status });
    },
    remove(tabId: number) {
      for (const listener of removed) listener(tabId);
    },
  };
}
