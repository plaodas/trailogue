import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../../src/domain/types";
import { OllamaError } from "../../src/search/ollama";
import type { SemanticIndex } from "../../src/search/semanticIndex";
import { SemanticSearchError, SemanticSearchService } from "../../desk/semanticSearch";
import {
  readSemanticIndexFile,
  SEMANTIC_INDEX_FILE,
  TRAILOGUE_DERIVED_DIRECTORY,
  writeSemanticIndexFile,
} from "../../desk/semanticIndexStore";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("semantic search service", () => {
  it("indexes each message, searches by vector, and excludes literal matches", async () => {
    let stored: SemanticIndex | undefined;
    const embed = vi.fn(async (_model: string, inputs: readonly string[]) =>
      inputs.map((input) => {
        if (input === "問い") return [1, 0];
        if (input === "返答") return [0, 1];
        if (input === "質問") return [0.9, 0.1];
        return [1, 0];
      }),
    );
    const service = new SemanticSearchService("unused", [record()], "model", {
      embed,
      persistence: {
        load: async () => stored,
        save: async (index) => {
          stored = index;
        },
      },
    });

    await service.ensureIndex();
    expect(stored?.entries.map((entry) => entry.messageId)).toEqual(["u", "a"]);
    expect(JSON.stringify(stored)).not.toContain("問い");
    await expect(service.search("質問")).resolves.toMatchObject([{ messageId: "u" }, { messageId: "a" }]);
    await expect(service.search("問い")).resolves.toMatchObject([{ messageId: "a" }]);
  });

  it("reuses a complete cache and shares concurrent index work", async () => {
    const cached = completeIndex();
    const load = vi.fn(async () => cached);
    const save = vi.fn(async () => {});
    const embed = vi.fn(async () => [[1, 0]]);
    const service = new SemanticSearchService("unused", [record()], "model", {
      embed,
      persistence: { load, save },
    });

    await Promise.all([service.ensureIndex(), service.ensureIndex()]);
    expect(load).toHaveBeenCalledOnce();
    expect(embed).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not partially save when embedding fails", async () => {
    const save = vi.fn(async () => {});
    const service = new SemanticSearchService("unused", [record()], "model", {
      embed: async () => {
        throw new OllamaError("input_too_long", "too long");
      },
      persistence: { load: async () => undefined, save },
    });

    await expect(service.ensureIndex()).rejects.toMatchObject({ code: "input_too_long" });
    expect(save).not.toHaveBeenCalled();
  });

  it("reports an index write failure without treating the search as successful", async () => {
    const service = new SemanticSearchService("unused", [record()], "model", {
      embed: async (_model, inputs) => inputs.map((_, index) => [1, index]),
      persistence: {
        load: async () => undefined,
        save: async () => {
          throw new Error("disk");
        },
      },
    });

    await expect(service.ensureIndex()).rejects.toMatchObject({ code: "index_unavailable" });
  });

  it("keeps exact search independent when no model was selected", async () => {
    const service = new SemanticSearchService("unused", [record()], undefined);
    await expect(service.search("質問")).rejects.toEqual(
      expect.objectContaining<Partial<SemanticSearchError>>({ code: "model_required" }),
    );
  });
});

describe("semantic index file", () => {
  it("writes an atomic sidecar and reads it back", async () => {
    const root = await mkdtemp(join(tmpdir(), "trailogue-semantic-"));
    temporaryDirectories.push(root);
    const index = completeIndex();

    await writeSemanticIndexFile(root, index);

    expect(await readSemanticIndexFile(root)).toEqual(index);
    const raw = await readFile(join(root, TRAILOGUE_DERIVED_DIRECTORY, SEMANTIC_INDEX_FILE), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

function record(): Conversation {
  return {
    id: "conversation",
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/example",
    sourceId: "example",
    sourceKind: "conversation",
    title: "題",
    capturedAt: "2026-01-01T00:00:00.000Z",
    parserVersion: "test",
    contentHash: "a".repeat(64),
    messages: [
      { id: "u", ordinal: 0, role: "user", content: "問い" },
      { id: "a", ordinal: 1, role: "assistant", content: "返答" },
    ],
  };
}

function completeIndex(): SemanticIndex {
  return {
    version: 1,
    model: "model",
    dimensions: 2,
    entries: [
      {
        contentHash: "a".repeat(64),
        conversationId: "conversation",
        messageId: "u",
        ordinal: 0,
        role: "user",
        vector: [1, 0],
      },
      {
        contentHash: "a".repeat(64),
        conversationId: "conversation",
        messageId: "a",
        ordinal: 1,
        role: "assistant",
        vector: [0, 1],
      },
    ],
  };
}
