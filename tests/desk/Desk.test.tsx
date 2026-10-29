import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Desk } from "../../desk/Desk";
import type { Conversation } from "../../src/domain/types";
import type { SemanticMatch } from "../../src/search/rank";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("desk semantic search", () => {
  it("contacts Ollama-facing APIs only after an explicit action and keeps results on return", async () => {
    const conversation = record();
    const semantic = semanticMatch();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/album") return Response.json(album());
      if (url.startsWith("/api/search?q=")) return Response.json({ matches: [] });
      if (url === "/api/search/semantic/index") return Response.json({ ok: true });
      if (url === "/api/search/semantic") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ query: "質問" });
        return Response.json({ matches: [semantic] });
      }
      if (url === "/api/opened") return Response.json({ opened: { [conversation.contentHash]: "2026-01-02" } });
      if (url === `/api/conversations/${conversation.id}`) return Response.json(conversation);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    render(<Desk />);

    const input = await screen.findByRole("searchbox");
    fireEvent.change(input, { target: { value: "質問" } });
    expect(await screen.findByText("この文字列を含む発言はありません")).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/api/search/semantic"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "似た言葉でも探す" }));
    expect(await screen.findByText("近い返答")).toBeTruthy();
    const semanticCalls = fetcher.mock.calls.filter(([url]) => String(url).includes("/api/search/semantic"));
    expect(semanticCalls).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /近い返答/ }));
    expect(await screen.findByRole("heading", { name: "題" })).toBeTruthy();
    expect(document.querySelector("mark")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "結果へ戻る" }));
    expect(await screen.findByText("近い返答")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/api/search/semantic"))).toHaveLength(2);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "別" } });
    expect(screen.queryByText("近い返答")).toBeNull();
    expect(await screen.findByRole("button", { name: "似た言葉でも探す" })).toBeTruthy();
  });

  it("keeps exact results when semantic indexing fails", async () => {
    const exact = {
      ...semanticMatch(),
      content: "質問を含む",
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/album") return Response.json(album());
      if (url.startsWith("/api/search?q=")) return Response.json({ matches: [exact] });
      if (url === "/api/search/semantic/index") {
        return Response.json({ code: "unavailable", error: "Ollamaへ接続できません" }, { status: 503 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<Desk />);

    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "質問" } });
    expect(await screen.findByRole("button", { name: /質問.*を含む/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "似た言葉でも探す" }));
    expect(await screen.findByText("Ollamaへ接続できません")).toBeTruthy();
    expect(screen.getByRole("button", { name: /質問.*を含む/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "もう一度探す" })).toBeTruthy();
  });
});

function album() {
  return {
    unreadable: 0,
    timeZone: "Asia/Tokyo",
    opened: {},
    records: [
      {
        id: "conversation",
        sourceId: "source",
        provider: "chatgpt",
        title: "題",
        capturedAt: "2026-01-01T00:00:00.000Z",
        contentHash: "a".repeat(64),
        messageCount: 1,
        parserVersion: "test",
      },
    ],
  };
}

function semanticMatch(): SemanticMatch {
  return {
    conversationId: "conversation",
    messageId: "a",
    ordinal: 0,
    role: "assistant",
    content: "近い返答",
    title: "題",
    provider: "chatgpt",
    capturedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "a".repeat(64),
  };
}

function record(): Conversation {
  return {
    id: "conversation",
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/source",
    sourceId: "source",
    sourceKind: "conversation",
    title: "題",
    capturedAt: "2026-01-01T00:00:00.000Z",
    parserVersion: "test",
    contentHash: "a".repeat(64),
    messages: [{ id: "a", ordinal: 0, role: "assistant", content: "近い返答" }],
  };
}
