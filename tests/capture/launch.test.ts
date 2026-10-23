import { describe, expect, it, vi } from "vitest";
import { createCaptureLauncher } from "../../src/capture/launch";
import type { DashboardStatus } from "../../src/capture/status";

const COPILOT = "https://copilot.cloud.microsoft/chat/conversation/conversation-1";
const CHATGPT = "https://chatgpt.com/c/conv-1";

describe("createCaptureLauncher", () => {
  it("opens the dashboard without reading an unsupported tab", async () => {
    const host = createHost();
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 7, url: "https://example.com/" });
    expect(host.published).toEqual([
      expect.objectContaining({ generation: 1, allowed: false, phase: "ready" }),
    ]);
    expect(host.openDashboard).toHaveBeenCalledTimes(1);
  });

  it("publishes ready for the open page without reloading it", async () => {
    const host = createHost();
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 4, url: CHATGPT });
    expect(host.published).toEqual([
      expect.objectContaining({ generation: 1, allowed: true, tabId: 4, phase: "ready" }),
    ]);
    expect(host.openDashboard).toHaveBeenCalledTimes(1);
  });

  it("reads a Copilot tab the same way, without reloading it", async () => {
    const host = createHost();
    const launcher = createCaptureLauncher(host);
    await launcher.click({ id: 4, url: COPILOT });
    expect(host.published).toEqual([
      expect.objectContaining({ generation: 1, allowed: true, tabId: 4, phase: "ready" }),
    ]);
  });

  it("keeps only the latest click when another starts while the dashboard is opening", async () => {
    const host = createHost();
    const openings: Array<() => void> = [];
    host.openDashboard.mockImplementation(
      () => new Promise<void>((resolve) => openings.push(resolve)),
    );
    const launcher = createCaptureLauncher(host);
    const first = launcher.click({ id: 4, url: CHATGPT });
    const second = launcher.click({ id: 9, url: COPILOT });
    await Promise.resolve();
    expect(openings).toHaveLength(2);
    openings[0]?.();
    openings[1]?.();
    await Promise.all([first, second]);
    expect(host.published).toEqual([
      expect.objectContaining({ generation: 2, allowed: true, tabId: 9, phase: "ready" }),
    ]);
  });
});

function createHost() {
  const published: DashboardStatus[] = [];
  return {
    published,
    openDashboard: vi.fn(async () => {}),
    publish(status: DashboardStatus) {
      published.push(status);
    },
  };
}
