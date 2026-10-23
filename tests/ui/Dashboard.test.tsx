import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_STATUS, type DashboardStatus } from "../../src/capture/status";
import { normalize } from "../../src/domain/normalize";
import type { RawCapture, RawMessage } from "../../src/domain/types";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository, type ConversationRepository } from "../../src/storage/repository";
import type { CapturePort, CaptureRead } from "../../src/ui/capturePort";
import { Dashboard } from "../../src/ui/Dashboard";

const databases: TrailogueDatabase[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("Dashboard", () => {
  it("shows the full transcript in document order", async () => {
    const repository = createTestRepository();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    render(<Dashboard repository={repository} capture={port.port} />);
    port.emit(readyStatus());

    expect(await screen.findByText("発言の全文プレビュー")).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(screen.getByText("不明")).toBeTruthy();
    expect(screen.getByText("空の本文が1件あります。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Markdownを書き出す" })).toBeNull();
  });

  it("opens the saved record instead of inserting the same hash", async () => {
    const repository = createTestRepository();
    const existing = await normalize(sampleCapture(), {
      id: "existing",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.insert(existing);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    render(<Dashboard repository={repository} capture={port.port} />);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "既存を開く" }));
    expect(await screen.findByRole("heading", { name: "経路の題" })).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(await repository.list()).toHaveLength(1);
  });

  it("shows the saved original text from the list", async () => {
    const repository = createTestRepository();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    render(<Dashboard repository={repository} capture={port.port} />);
    port.emit(readyStatus());
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "一覧へ戻る" }));

    const row = await screen.findByRole("button", { name: /経路の題/ });
    expect(row.textContent).toContain("3件");
    fireEvent.click(row);
    expect(await screen.findByRole("heading", { name: "経路の題" })).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    const stored = await repository.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.messages.map((message) => message.content)).toEqual([
      "初めの問い",
      "一行目\n二行目の全文",
      "",
    ]);
  });

  it("shows every message on the thought path and downloads the saved text", async () => {
    const repository = createTestRepository();
    const downloads = captureDownloads();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    render(<Dashboard repository={repository} capture={port.port} />);
    port.emit(readyStatus());
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));
    expect(await screen.findByRole("button", { name: "原文" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "思考経路" }));

    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    fireEvent.click(screen.getByRole("button", { name: "Markdownを書き出す" }));
    const stored = await repository.list();
    const markdown = await downloads[0]?.text();
    expect(markdown).toContain("初めの問い");
    expect(markdown).toContain("一行目\n二行目の全文");
    expect(markdown).toContain(`- Captured: ${stored[0]?.capturedAt}`);
  });

  it("keeps the preview text when saving fails", async () => {
    const repository = createTestRepository();
    const failing: ConversationRepository = {
      ...repository,
      insert: async () => {
        throw new Error("disk");
      },
    };
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    render(<Dashboard repository={failing} capture={port.port} />);
    port.emit(readyStatus());
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));

    expect(await screen.findByText("記録はまだこの画面にある")).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(screen.getByRole("button", { name: "保存を再試行" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "破棄" })).toBeNull();
    expect(screen.queryByRole("button", { name: "思考経路" })).toBeNull();
    const downloads = captureDownloads();
    fireEvent.click(screen.getByRole("button", { name: "Markdownを書き出す" }));
    const markdown = await downloads[0]?.text();
    expect(markdown).toContain("初めの問い");
    expect(markdown).toContain("一行目\n二行目の全文");
    expect(markdown).toContain("- Captured: \n");
    expect(markdown).not.toContain("1970-01-01");
    expect(await repository.list()).toHaveLength(0);
  });

  it("retries a loading page for about 10 seconds and then waits", async () => {
    vi.useFakeTimers();
    const repository = createTestRepository();
    const read = vi.fn(async (): Promise<CaptureRead> => ({ ok: false, code: "not_ready" }));
    const port = createPort(read);
    render(<Dashboard repository={repository} capture={port.port} />);
    await act(async () => {
      port.emit(readyStatus());
    });

    expect(screen.getByText("現在のタブで会話の表示を待っている")).toBeTruthy();
    for (let step = 0; step < 4; step += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    }
    expect(read.mock.calls.length).toBe(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("会話の表示を待っています")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(read.mock.calls.length).toBe(5);
  });
});

function createTestRepository(): ConversationRepository {
  const db = openDatabase(`trailogue-test-${crypto.randomUUID()}`);
  databases.push(db);
  return createRepository(db);
}

function createPort(read: CapturePort["read"]) {
  let listener: ((status: DashboardStatus) => void) | undefined;
  const port: CapturePort = {
    watch(next) {
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
    read,
  };
  return {
    port,
    emit(status: DashboardStatus) {
      listener?.(status);
    },
  };
}

function readyStatus(): DashboardStatus {
  return {
    type: DASHBOARD_STATUS,
    generation: 1,
    allowed: true,
    tabId: 4,
    phase: "ready",
  };
}

function sampleCapture(): RawCapture {
  const messages: RawMessage[] = [
    { ordinal: 1, role: "assistant", content: "一行目\n二行目の全文", providerMessageId: "a" },
    { ordinal: 0, role: "user", content: "  初めの問い  ", providerMessageId: "u" },
    { ordinal: 2, role: "unknown", content: "   ", providerMessageId: "x" },
  ];
  return {
    provider: "copilot",
    sourceUrl: "https://copilot.cloud.microsoft/chat/conversation/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "経路の題",
    parserVersion: "copilot-1",
    messages,
  };
}

function messageBodies(): string[] {
  return [...document.querySelectorAll("pre")].map((node) => node.textContent ?? "");
}

function captureDownloads(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
    blobs.push(value as Blob);
    return "blob:markdown";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return blobs;
}
