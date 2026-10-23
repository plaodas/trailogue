import { classifyPage } from "./page";
import { reloadAndWait, type TabEvents } from "./reload";
import { DASHBOARD_STATUS, type DashboardStatus } from "./status";

const IDLE_STATUS: DashboardStatus = {
  type: DASHBOARD_STATUS,
  generation: 0,
  allowed: false,
  tabId: null,
  phase: "ready",
};

export function createCaptureLauncher(host: {
  openDashboard: () => Promise<void>;
  publish: (status: DashboardStatus) => void;
  tabs: TabEvents;
}) {
  let generation = 0;
  let current = IDLE_STATUS;
  let stopReload = () => {};

  function publish(status: DashboardStatus) {
    current = status;
    host.publish(status);
  }

  return {
    status(): DashboardStatus {
      return current;
    },
    async click(tab: { id?: number; url?: string }): Promise<void> {
      const token = ++generation;
      stopReload();
      stopReload = () => {};
      const opening = host.openDashboard();
      const allowed = tab.id !== undefined && Boolean(tab.url && classifyPage(tab.url));
      if (!allowed || tab.id === undefined) {
        publish({
          type: DASHBOARD_STATUS,
          generation: token,
          allowed: false,
          tabId: null,
          phase: "ready",
        });
        await opening;
        return;
      }

      publish({
        type: DASHBOARD_STATUS,
        generation: token,
        allowed: true,
        tabId: tab.id,
        phase: "reloading",
      });
      await opening;
      if (token !== generation) return;

      const reload = reloadAndWait(tab.id, host.tabs);
      stopReload = reload.stop;
      if (token !== generation) {
        reload.stop();
        return;
      }
      const outcome = await reload.done;
      if (token !== generation || outcome === "stopped") return;
      publish({
        type: DASHBOARD_STATUS,
        generation: token,
        allowed: true,
        tabId: tab.id,
        phase: outcome === "complete" ? "ready" : "closed",
      });
    },
  };
}
