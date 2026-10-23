import { describe, expect, it, vi } from "vitest";
import { createCaptureLauncher } from "../../src/capture/launch";
import type { TabEvents } from "../../src/capture/reload";
import type { DashboardStatus } from "../../src/capture/status";

const COPILOT = "https://copilot.cloud.microsoft/chat/conversation/conversation-1";

describe("createCaptureLauncher", () => {
  it("opens the dashboard without reloading an unsupported tab", async () => {
    const host = createHost();
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 7, url: "https://example.com/" });
    expect(host.reload).not.toHaveBeenCalled();
    expect(host.published).toEqual([
      expect.objectContaining({ generation: 1, allowed: false, phase: "ready" }),
    ]);
    expect(host.openDashboard).toHaveBeenCalledTimes(1);
  });

  it("reloads an allowed tab and publishes ready after the new document completes", async () => {
    const host = createHost();
    host.reload.mockImplementation(async () => {
      host.emit(4, "loading");
      host.emit(4, "complete");
    });
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 4, url: COPILOT });
    expect(host.reload).toHaveBeenCalledWith(4);
    expect(host.published.map((status) => status.phase)).toEqual(["reloading", "ready"]);
    expect(host.published[1]).toMatchObject({ allowed: true, tabId: 4, generation: 1 });
  });

  it("publishes closed when the reload does not finish", async () => {
    const host = createHost();
    host.reload.mockImplementation(() => {
      host.remove(4);
      return Promise.resolve();
    });
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 4, url: COPILOT });
    expect(host.published.map((status) => status.phase)).toEqual(["reloading", "closed"]);
  });

  it("drops a stale reload when another click starts first", async () => {
    const host = createHost();
    const openings: Array<() => void> = [];
    host.openDashboard.mockImplementation(
      () => new Promise<void>((resolve) => openings.push(resolve)),
    );
    host.reload.mockImplementation(async () => {
      host.emit(4, "loading");
      host.emit(4, "complete");
    });
    const launcher = createCaptureLauncher(host);
    const first = launcher.click({ id: 4, url: COPILOT });
    const second = launcher.click({ id: 4, url: COPILOT });
    await Promise.resolve();
    expect(openings).toHaveLength(2);
    openings[0]?.();
    openings[1]?.();
    await Promise.all([first, second]);
    expect(host.reload).toHaveBeenCalledTimes(1);
    expect(host.published.map((status) => status.generation)).toEqual([1, 2, 2]);
    expect(host.published[2]?.phase).toBe("ready");
  });
});

function createHost() {
  const updated = new Set<(tabId: number, info: { status?: string }) => void>();
  const removed = new Set<(tabId: number) => void>();
  const published: DashboardStatus[] = [];
  const reload = vi.fn(async () => {});
  const tabs: TabEvents = {
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
    published,
    reload,
    openDashboard: vi.fn(async () => {}),
    publish(status: DashboardStatus) {
      published.push(status);
    },
    tabs,
    emit(tabId: number, status: string) {
      for (const listener of updated) listener(tabId, { status });
    },
    remove(tabId: number) {
      for (const listener of removed) listener(tabId);
    },
  };
}
