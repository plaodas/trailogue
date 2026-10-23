import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_STATUS, type DashboardStatus } from "../../src/capture/status";
import { normalize } from "../../src/domain/normalize";
import type { RawCapture, RawMessage } from "../../src/domain/types";
import {
  findConversationFile,
  listConversationFiles,
  writeConversationFile,
  type ArchiveDirectory,
} from "../../src/archive/conversationFile";
import type { ArchiveConnection, ConversationArchive } from "../../src/archive/fileSystemArchive";
import { openDatabase, type TrailogueDatabase } from "../../src/storage/db";
import { createRepository, type ConversationRepository } from "../../src/storage/repository";
import type { CapturePort, CaptureRead } from "../../src/ui/capturePort";
import type { SidebarBatchPort } from "../../src/ui/extensionBatch";
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
    renderDashboard(repository, port.port);
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
    renderDashboard(repository, port.port);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "既存を開く" }));
    expect(await screen.findByRole("heading", { name: "経路の題" })).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(await repository.list()).toHaveLength(1);
  });

  it("returns to the saved list from a preview without opening the original", async () => {
    const repository = createTestRepository();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port);
    port.emit(readyStatus());

    expect(await screen.findByText("発言の全文プレビュー")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    expect(await screen.findByRole("heading", { name: "保存した会話" })).toBeTruthy();
    expect(screen.queryByText("発言の全文プレビュー")).toBeNull();
    expect(screen.queryByRole("heading", { name: "経路の題" })).toBeNull();
    expect(await repository.list()).toHaveLength(0);
  });

  it("returns to the saved list from a duplicate without opening the record", async () => {
    const repository = createTestRepository();
    const existing = await normalize(sampleCapture(), {
      id: "existing",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.insert(existing);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    expect(await screen.findByRole("heading", { name: "保存した会話" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "経路の題" })).toBeNull();
    expect(screen.queryByRole("button", { name: "原文" })).toBeNull();
    expect(screen.getByRole("button", { name: /経路の題/ })).toBeTruthy();
  });

  it("returns to the list before a preview can replace it", async () => {
    const repository = createTestRepository();
    let finish: (result: CaptureRead) => void = () => {};
    const port = createPort(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderDashboard(repository, port.port);
    port.emit(readyStatus());

    expect(await screen.findByText("会話を取得しています")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    expect(await screen.findByRole("heading", { name: "保存した会話" })).toBeTruthy();

    await act(async () => {
      finish({ ok: true, capture: sampleCapture() });
    });
    expect(screen.queryByText("発言の全文プレビュー")).toBeNull();
    expect(screen.getByRole("heading", { name: "保存した会話" })).toBeTruthy();
  });

  it("shows the saved original text from the list", async () => {
    const repository = createTestRepository();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port);
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
    renderDashboard(repository, port.port);
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
    const insert = vi.spyOn(repository, "insert");
    const memory = createMemoryArchive();
    memory.archive.write = async () => {
      throw new Error("disk");
    };
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    port.emit(readyStatus());
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));

    expect(await screen.findByText("記録はまだこの画面にある")).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(screen.getByRole("button", { name: "保存を再試行" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "破棄" })).toBeNull();
    expect(screen.queryByRole("button", { name: "一覧へ戻る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "思考経路" })).toBeNull();
    const downloads = captureDownloads();
    fireEvent.click(screen.getByRole("button", { name: "Markdownを書き出す" }));
    const markdown = await downloads[0]?.text();
    expect(markdown).toContain("初めの問い");
    expect(markdown).toContain("一行目\n二行目の全文");
    expect(markdown).toContain("- Captured: \n");
    expect(markdown).not.toContain("1970-01-01");
    expect(insert).not.toHaveBeenCalled();
    expect(await repository.list()).toHaveLength(0);
  });

  it("treats a folder file as the saved record when IndexedDB is empty", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const existing = await normalize(sampleCapture(), {
      id: "from-folder",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await memory.archive.write(existing);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "既存を開く" }));
    expect(await screen.findByRole("heading", { name: "経路の題" })).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
  });

  it("restores folder files into an empty working copy", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const existing = await normalize(sampleCapture(), {
      id: "from-folder",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await memory.archive.write(existing);
    memory.disconnect();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    expect(await screen.findByText("記録フォルダが未選択です。この一覧はブラウザの中にあります。")).toBeTruthy();
    expect(await repository.list()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "記録フォルダを選ぶ" }));

    const row = await screen.findByRole("button", { name: /経路の題/ });
    expect(row.textContent).toContain("3件");
    fireEvent.click(row);
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.list())[0]?.id).toBe("from-folder");
  });

  it("writes working copies that are missing from the folder", async () => {
    const repository = createTestRepository();
    const existing = await normalize(sampleCapture(), {
      id: "cached",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.insert(existing);
    const memory = createMemoryArchive("missing");
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    fireEvent.click(await screen.findByRole("button", { name: "記録フォルダを選ぶ" }));
    await waitFor(async () => {
      const listing = await memory.archive.list();
      expect(listing.conversations.map((conversation) => conversation.id)).toEqual(["cached"]);
    });
    const listing = await memory.archive.list();
    expect(listing.conversations.map((conversation) => conversation.id)).toEqual(["cached"]);
    expect(listing.conversations[0]?.messages.map((message) => message.content)).toEqual([
      "初めの問い",
      "一行目\n二行目の全文",
      "",
    ]);
  });

  it("retries a loading page for about 10 seconds and then waits", async () => {
    vi.useFakeTimers();
    const repository = createTestRepository();
    const read = vi.fn(async (): Promise<CaptureRead> => ({ ok: false, code: "not_ready" }));
    const port = createPort(read);
    renderDashboard(repository, port.port);
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

  it("imports the sidebar list into the folder without opening a preview", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    let current = "one";
    const opened: string[] = [];
    const capture = createPort(async () => ({
      ok: true,
      capture: {
        ...sampleCapture(),
        sourceId: current,
        sourceUrl: `https://copilot.cloud.microsoft/chat/conversation/${current}`,
        title: current,
        messages: [{ ordinal: 0, role: "user", content: current, providerMessageId: current }],
      },
    }));
    const batch: SidebarBatchPort = {
      async findTab() {
        return 4;
      },
      async listIds() {
        return ["one", "two"];
      },
      async open(_tabId, id) {
        opened.push(id);
        current = id;
        if (id === "one") capture.emit(readyStatus());
        return "complete";
      },
    };
    renderDashboard(repository, capture.port, memory.archive, batch);
    fireEvent.click(await screen.findByRole("button", { name: "サイドバーの会話を順に取り込む" }));

    expect(await screen.findByRole("button", { name: /one/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /two/ })).toBeTruthy();
    expect(screen.getByText(/サイドバーの会話を取り込みました/)).toBeTruthy();
    expect(screen.getByText(/保存 2/)).toBeTruthy();
    expect(screen.queryByText("発言の全文プレビュー")).toBeNull();
    expect(opened).toEqual(["one", "two"]);
    expect(await repository.list()).toHaveLength(2);
  });
});

function renderDashboard(
  repository: ConversationRepository,
  capture: CapturePort,
  archive: ConversationArchive = createMemoryArchive().archive,
  batch?: SidebarBatchPort,
) {
  render(<Dashboard repository={repository} archive={archive} capture={capture} sidebar={batch} />);
}

function createMemoryArchive(initial: ArchiveConnection = "ready") {
  let connection = initial;
  const files = new Map<string, string>();
  const directory: ArchiveDirectory = {
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, contents) {
      files.set(name, contents);
    },
    async list() {
      return [...files].map(([name, text]) => ({ name, text }));
    },
  };
  const archive: ConversationArchive = {
    async connection() {
      return connection;
    },
    async openFolder() {
      connection = "ready";
      return "ready";
    },
    async findByHash(contentHash) {
      if (connection !== "ready") throw new Error("archive unavailable");
      return findConversationFile(directory, contentHash);
    },
    async write(conversation) {
      if (connection !== "ready") throw new Error("archive unavailable");
      await writeConversationFile(directory, conversation);
    },
    async list() {
      if (connection !== "ready") throw new Error("archive unavailable");
      return listConversationFiles(directory);
    },
  };
  return {
    archive,
    disconnect() {
      connection = "missing";
    },
  };
}

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
