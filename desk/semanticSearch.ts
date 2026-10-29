import type { Conversation } from "../src/domain/types";
import { embedTexts, OllamaError } from "../src/search/ollama";
import {
  rankSemanticMatches,
  semanticLocationKey,
  validVector,
  type SemanticCandidate,
  type SemanticMatch,
} from "../src/search/rank";
import {
  reconcileSemanticIndex,
  semanticDocuments,
  type SemanticDocument,
  type SemanticIndex,
  type SemanticIndexEntry,
} from "../src/search/semanticIndex";
import { findTextMatches } from "../src/search/text";
import { readSemanticIndexFile, writeSemanticIndexFile } from "./semanticIndexStore";

const EMBEDDING_BATCH_SIZE = 32;

export type SemanticSearchFailureCode =
  | "invalid_query"
  | "model_required"
  | "unavailable"
  | "model_not_found"
  | "input_too_long"
  | "invalid_response"
  | "index_unavailable";

export class SemanticSearchError extends Error {
  constructor(
    readonly code: SemanticSearchFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SemanticSearchError";
  }
}

export type SemanticIndexPersistence = {
  load(): Promise<SemanticIndex | undefined>;
  save(index: SemanticIndex): Promise<void>;
};

export type SemanticSearchDependencies = {
  embed?: (model: string, inputs: readonly string[]) => Promise<number[][]>;
  persistence?: SemanticIndexPersistence;
};

export class SemanticSearchService {
  private readonly conversations: Conversation[];
  private readonly documents: SemanticDocument[];
  private readonly embed: (model: string, inputs: readonly string[]) => Promise<number[][]>;
  private readonly persistence: SemanticIndexPersistence;
  private index: SemanticIndex | undefined;
  private loaded = false;
  private indexing: Promise<SemanticIndex> | null = null;

  constructor(
    private readonly root: string,
    conversations: readonly Conversation[],
    private readonly model: string | undefined,
    dependencies: SemanticSearchDependencies = {},
  ) {
    this.conversations = [...conversations];
    this.documents = semanticDocuments(this.conversations);
    this.embed = dependencies.embed ?? embedTexts;
    this.persistence =
      dependencies.persistence ??
      {
        load: () => readSemanticIndexFile(this.root),
        save: (index) => writeSemanticIndexFile(this.root, index),
      };
  }

  async ensureIndex(): Promise<void> {
    await this.readyIndex();
  }

  async search(query: string): Promise<SemanticMatch[]> {
    if (query.trim() === "") throw new SemanticSearchError("invalid_query", "検索する言葉が空です");
    const index = await this.readyIndex();
    if (index.entries.length === 0) return [];

    const [queryVector] = await this.callEmbed([query]);
    if (!queryVector || !validVector(queryVector, index.dimensions)) {
      throw new SemanticSearchError("invalid_response", "Ollamaのベクトル次元が索引と一致しません");
    }

    const candidates = this.candidates(index);
    const excluded = new Set(
      findTextMatches(this.conversations, query).map((match) =>
        semanticLocationKey(match.contentHash, match.messageId),
      ),
    );
    return rankSemanticMatches(queryVector, candidates, excluded, 20);
  }

  private async readyIndex(): Promise<SemanticIndex> {
    if (!this.model || this.model.trim() === "") {
      throw new SemanticSearchError("model_required", "机の起動時にembeddingモデルを指定してください");
    }
    if (this.indexing) return this.indexing;
    this.indexing = this.buildIndex(this.model).finally(() => {
      this.indexing = null;
    });
    return this.indexing;
  }

  private async buildIndex(model: string): Promise<SemanticIndex> {
    if (!this.loaded) {
      this.index = await this.persistence.load();
      this.loaded = true;
    }
    const reconciled = reconcileSemanticIndex(this.index, model, this.documents);
    let next = reconciled.index;

    if (reconciled.missing.length > 0) {
      const additions: SemanticIndexEntry[] = [];
      let dimensions = next.dimensions;
      for (let offset = 0; offset < reconciled.missing.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = reconciled.missing.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const vectors = await this.callEmbed(batch.map((document) => document.content));
        for (let index = 0; index < batch.length; index += 1) {
          const document = batch[index] as SemanticDocument;
          const vector = vectors[index];
          if (!vector || !validVector(vector, dimensions === 0 ? undefined : dimensions)) {
            throw new SemanticSearchError("invalid_response", "Ollamaが揃ったベクトルを返しませんでした");
          }
          if (dimensions === 0) dimensions = vector.length;
          additions.push(toEntry(document, vector));
        }
      }
      next = { ...next, dimensions, entries: [...next.entries, ...additions] };
    }

    if (reconciled.changed || reconciled.missing.length > 0) {
      try {
        await this.persistence.save(next);
      } catch (error) {
        throw new SemanticSearchError("index_unavailable", "類義語の索引を保存できません", { cause: error });
      }
    }
    this.index = next;
    return next;
  }

  private async callEmbed(inputs: readonly string[]): Promise<number[][]> {
    try {
      return await this.embed(this.model as string, inputs);
    } catch (error) {
      if (error instanceof OllamaError) {
        throw new SemanticSearchError(error.code, semanticErrorMessage(error.code), { cause: error });
      }
      if (error instanceof SemanticSearchError) throw error;
      throw new SemanticSearchError("unavailable", "Ollamaへ接続できません", { cause: error });
    }
  }

  private candidates(index: SemanticIndex): SemanticCandidate[] {
    const conversations = new Map(this.conversations.map((conversation) => [conversation.id, conversation]));
    const candidates: SemanticCandidate[] = [];
    for (const entry of index.entries) {
      const conversation = conversations.get(entry.conversationId);
      const message = conversation?.messages.find((item) => item.id === entry.messageId);
      if (!conversation || !message || conversation.contentHash !== entry.contentHash) continue;
      candidates.push({
        conversationId: conversation.id,
        messageId: message.id,
        ordinal: message.ordinal,
        role: message.role,
        content: message.content,
        title: conversation.title,
        provider: conversation.provider,
        capturedAt: conversation.capturedAt,
        contentHash: conversation.contentHash,
        vector: entry.vector,
      });
    }
    return candidates;
  }
}

function toEntry(document: SemanticDocument, vector: number[]): SemanticIndexEntry {
  const { content: _content, ...location } = document;
  return { ...location, vector };
}

function semanticErrorMessage(code: OllamaError["code"]): string {
  if (code === "model_not_found") return "指定したembeddingモデルをOllamaで利用できません";
  if (code === "input_too_long") return "長すぎる発言があり、類義語の索引を作れません";
  if (code === "invalid_response") return "Ollamaの応答を利用できません";
  return "Ollamaへ接続できません";
}
