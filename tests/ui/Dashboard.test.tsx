import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_STATUS, type DashboardStatus } from "../../src/capture/status";
import { normalize } from "../../src/domain/normalize";
import type { RawCapture, RawMessage } from "../../src/domain/types";
import {
  findConversationFile,
  listConversationFiles,
  removeConversationFile,
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
  vi.unstubAllGlobals();
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
    const memory = createMemoryArchive();
    await memory.archive.write(existing);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "既存を開く" }));
    expect(await screen.findByRole("heading", { name: "経路の題" })).toBeTruthy();
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.list())[0]?.id).toBe("existing");
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
    const memory = createMemoryArchive("missing");
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    port.emit(readyStatus());

    expect(await screen.findByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeTruthy();
    expect(screen.queryByText("記録フォルダが未選択です。この一覧はブラウザの中にあります。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    const notice = await screen.findByText("記録フォルダが未選択です。この一覧はブラウザの中にあります。");
    const heading = screen.getByRole("heading", { name: "保存した会話" });
    expect(notice.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.closest(".archive-banner")).toBeTruthy();
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

    const notice = await screen.findByText("記録フォルダが未選択です。この一覧はブラウザの中にあります。");
    const heading = screen.getByRole("heading", { name: "保存した会話" });
    expect(notice.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.closest(".archive-banner")).toBeTruthy();
    expect(await repository.list()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "記録フォルダを選ぶ" }));

    const row = await screen.findByRole("button", { name: /経路の題/ });
    expect(row.textContent).toContain("3件");
    fireEvent.click(row);
    expect(messageBodies()).toEqual(["初めの問い", "一行目\n二行目の全文", ""]);
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.list())[0]?.id).toBe("from-folder");
  });

  it("drops cache rows that are missing from the folder", async () => {
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
      expect(await repository.findByHash(existing.contentHash)).toBeUndefined();
    });
    const listing = await memory.archive.list();
    expect(listing.conversations).toEqual([]);
  });

  it("does not treat a cache-only row as saved when the folder is readable", async () => {
    const repository = createTestRepository();
    const existing = await normalize(sampleCapture(), {
      id: "cached",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.insert(existing);
    const memory = createMemoryArchive();
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    port.emit(readyStatus());

    expect(await screen.findByText("発言の全文プレビュー")).toBeTruthy();
    expect(screen.queryByText("同じ軌跡は保存済みであり、既存の記録へ移れる")).toBeNull();
    await waitFor(async () => {
      expect(await repository.findByHash(existing.contentHash)).toBeUndefined();
    });
    expect((await memory.archive.list()).conversations).toEqual([]);
  });

  it("imports a folder file added elsewhere and drops one removed elsewhere", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const kept = await normalize(sampleCapture(), {
      id: "kept",
      capturedAt: "2026-02-01T00:00:00.000Z",
    });
    const dropped = await normalize(changedCapture(), {
      id: "dropped",
      capturedAt: "2026-03-01T00:00:00.000Z",
    });
    await memory.archive.write(kept);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    expect(await screen.findByRole("button", { name: /経路の題/ })).toBeTruthy();

    await memory.archive.write(dropped);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findByRole("button", { name: /変えた題/ })).toBeTruthy();
    expect((await repository.findByHash(dropped.contentHash))?.id).toBe("dropped");

    await memory.directory.remove(`${dropped.contentHash}.json`);
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /変えた題/ })).toBeNull();
    });
    expect(await memory.archive.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await repository.findByHash(dropped.contentHash)).toBeUndefined();
    expect(screen.getByRole("button", { name: /経路の題/ })).toBeTruthy();
  });

  it("places the closed-folder warning above the saved conversations", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive("needs_permission");
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    const notice = await screen.findByText("記録フォルダを開き直すと、ファイルから一覧を戻します。");
    const heading = screen.getByRole("heading", { name: "保存した会話" });
    expect(notice.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.closest(".archive-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "記録フォルダを開く" })).toBeTruthy();
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
        return [
          { id: "one", title: "one" },
          { id: "two", title: "two" },
        ];
      },
      async open(_tabId, id) {
        opened.push(id);
        current = id;
        if (id === "one") capture.emit(readyStatus());
        return "complete";
      },
    };
    renderDashboard(repository, capture.port, memory.archive, batch);
    fireEvent.click(await screen.findByRole("button", { name: "Copilotのサイドバーの会話を順に取り込む" }));

    expect(await screen.findByRole("button", { name: /one/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /two/ })).toBeTruthy();
    expect(screen.getByText(/サイドバーの会話を取り込みました/)).toBeTruthy();
    expect(screen.getByText(/保存 2/)).toBeTruthy();
    expect(screen.queryByText("発言の全文プレビュー")).toBeNull();
    expect(opened).toEqual(["one", "two"]);
    expect(await repository.list()).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "取り込めなかった会話" })).toBeNull();
  });

  it("lists the title and id of a conversation the batch could not store", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    let current = "kept";
    const capture = createPort(async () => {
      if (current !== "kept") return { ok: false, code: "incomplete_conversation" };
      return {
        ok: true,
        capture: {
          ...sampleCapture(),
          sourceId: current,
          sourceUrl: `https://chatgpt.com/c/${current}`,
          title: current,
          messages: [{ ordinal: 0, role: "user", content: current, providerMessageId: current }],
        },
      };
    });
    const batch: SidebarBatchPort = {
      async findTab() {
        return 4;
      },
      async listIds() {
        return [
          { id: "kept", title: "残った題" },
          { id: "missed", title: "失敗した題" },
          { id: "blank", title: "" },
        ];
      },
      async open(_tabId, id) {
        current = id;
        return "complete";
      },
    };
    renderDashboard(repository, capture.port, memory.archive, batch);
    fireEvent.click(await screen.findByRole("button", { name: "Copilotのサイドバーの会話を順に取り込む" }));

    expect(await screen.findByRole("heading", { name: "取り込めなかった会話" })).toBeTruthy();
    expect(screen.getByText("失敗した題")).toBeTruthy();
    expect(screen.getByText("missed")).toBeTruthy();
    expect(screen.getByText("blank").textContent).toBe("blank");
    expect(screen.queryByText("残った題")).toBeNull();
    expect(await repository.list()).toHaveLength(1);
  });

  it("deletes the selected record and does not write it back", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const kept = await normalize(sampleCapture(), {
      id: "kept",
      capturedAt: "2026-02-01T00:00:00.000Z",
    });
    const dropped = await normalize(changedCapture(), {
      id: "dropped",
      capturedAt: "2026-03-01T00:00:00.000Z",
    });
    await memory.archive.write(kept);
    await memory.archive.write(dropped);
    await memory.directory.write("bad.json", "{");
    await repository.insert(kept);
    await repository.insert(dropped);
    const confirm = stubConfirm(true);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    expect(await screen.findByRole("button", { name: /経路の題/ })).toBeTruthy();
    const row = screen.getByRole("button", { name: /変えた題/ }).closest("li");
    if (!row) throw new Error("missing row");
    fireEvent.click(within(row).getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /変えた題/ })).toBeNull();
    });
    expect(confirm).toHaveBeenCalledWith("「変えた題」（copilot）をフォルダとブラウザ内から消します。");
    expect(screen.getByRole("button", { name: /経路の題/ })).toBeTruthy();
    expect(screen.getByText("読めなかったファイルが1件あります。")).toBeTruthy();
    expect(await repository.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await repository.findByHash(kept.contentHash)).toBeTruthy();
    expect(await memory.archive.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await memory.archive.findByHash(kept.contentHash)).toBeTruthy();
    expect(await memory.directory.read("bad.json")).toBe("{");

    cleanup();
    renderDashboard(repository, port.port, memory.archive);
    expect(await screen.findByRole("button", { name: /経路の題/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /変えた題/ })).toBeNull();
    expect(await memory.archive.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await memory.directory.read("bad.json")).toBe("{");
  });

  it("deletes the open record and returns to the remaining list", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const kept = await normalize(sampleCapture(), {
      id: "kept",
      capturedAt: "2026-02-01T00:00:00.000Z",
    });
    const dropped = await normalize(changedCapture(), {
      id: "dropped",
      capturedAt: "2026-03-01T00:00:00.000Z",
    });
    await memory.archive.write(kept);
    await memory.archive.write(dropped);
    stubConfirm(true);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    fireEvent.click(await screen.findByRole("button", { name: /変えた題/ }));
    expect(await screen.findByRole("heading", { name: "変えた題" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(await screen.findByRole("heading", { name: "保存した会話" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "変えた題" })).toBeNull();
    expect(screen.getByRole("button", { name: /経路の題/ })).toBeTruthy();
    expect(await memory.archive.findByHash(dropped.contentHash)).toBeUndefined();
    expect(await memory.archive.findByHash(kept.contentHash)).toBeTruthy();
  });

  it("does not delete while the folder is closed", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive("missing");
    const existing = await normalize(sampleCapture(), {
      id: "existing",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.insert(existing);
    const confirm = stubConfirm(false);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);

    expect(await screen.findByRole("button", { name: /経路の題/ })).toBeTruthy();
    const button = screen.getByRole("button", { name: "削除" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);

    expect(confirm).not.toHaveBeenCalled();
    expect(await repository.findByHash(existing.contentHash)).toBeTruthy();
    expect(screen.getByRole("button", { name: "記録フォルダを選ぶ" })).toBeTruthy();
  });

  it("saves a confirmed export beside the existing generation of the same conversation", async () => {
    const repository = createTestRepository();
    const memory = createMemoryArchive();
    const existing = await normalize(
      {
        ...sampleCapture(),
        provider: "chatgpt",
        sourceUrl: "https://chatgpt.com/c/conv-keep",
        sourceId: "conv-keep",
        title: "ページ",
        parserVersion: "chatgpt-4",
        messages: [{ ordinal: 0, role: "user", content: "ページの本文", providerMessageId: "page" }],
      },
      { id: "page", capturedAt: "2026-01-01T00:00:00.000Z" },
    );
    await memory.archive.write(existing);
    const port = createPort(async () => ({ ok: true, capture: sampleCapture() }));
    renderDashboard(repository, port.port, memory.archive);
    expect(await screen.findByRole("button", { name: /ページ/ })).toBeTruthy();

    const input = document.querySelector("input[type=file]");
    if (!(input instanceof HTMLInputElement)) throw new Error("missing file input");
    const file = new File([JSON.stringify([
      {
        conversation_id: "conv-keep",
        title: "ファイル",
        current_node: "u",
        mapping: {
          r: { parent: null, message: null },
          u: {
            parent: "r",
            message: {
              id: "u",
              author: { role: "user" },
              content: { content_type: "text", parts: ["ファイルの本文"] },
            },
          },
        },
      },
      {
        conversation_id: "conv-broken",
        title: "壊れた",
        current_node: "gone",
        mapping: { r: { parent: null, message: null } },
      },
    ])], "conversations.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("同じ会話の記録が既にあります")).toBeTruthy();
    expect(screen.getByText("この会話の全発言を確認できないので保存しません。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "このExportを保存する" }));

    expect(await screen.findByText("保存 1 同じ内容 0 失敗 0")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ページ/ })).toBeTruthy();
    const imported = await screen.findByRole("button", { name: /ファイル/ });
    expect(imported.textContent).toContain("chatgpt-export-1");
    expect(await screen.findAllByText("内容が変わった")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /壊れた/ })).toBeNull();
    const listing = await memory.archive.list();
    expect(listing.conversations.map((item) => item.parserVersion).sort()).toEqual([
      "chatgpt-4",
      "chatgpt-export-1",
    ]);
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
    async remove(name) {
      files.delete(name);
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
    async remove(conversation) {
      if (connection !== "ready") throw new Error("archive unavailable");
      return removeConversationFile(directory, conversation);
    },
    async list() {
      if (connection !== "ready") throw new Error("archive unavailable");
      return listConversationFiles(directory);
    },
  };
  return {
    archive,
    directory,
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

function stubConfirm(value: boolean) {
  const confirm = vi.fn(() => value);
  vi.stubGlobal("confirm", confirm);
  return confirm;
}

function changedCapture(): RawCapture {
  return {
    ...sampleCapture(),
    title: "変えた題",
    messages: [{ ordinal: 0, role: "user", content: "あとの問い", providerMessageId: "u2" }],
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
