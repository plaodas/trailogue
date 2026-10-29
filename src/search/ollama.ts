export const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embed";

export type OllamaFailureCode =
  | "unavailable"
  | "model_not_found"
  | "input_too_long"
  | "invalid_response";

export class OllamaError extends Error {
  constructor(
    readonly code: OllamaFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OllamaError";
  }
}

export type EmbedOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export async function embedTexts(
  model: string,
  inputs: readonly string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  if (model.trim() === "") throw new OllamaError("model_not_found", "embedding model is empty");
  if (inputs.length === 0) return [];

  const fetcher = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  let response: Response;
  try {
    response = await fetcher(OLLAMA_EMBED_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: [...inputs], truncate: false }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OllamaError("unavailable", "Ollama is unavailable", { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404) throw new OllamaError("model_not_found", detail || "embedding model was not found");
    if (response.status === 400 && /context|length|token|truncate/i.test(detail)) {
      throw new OllamaError("input_too_long", detail || "embedding input is too long");
    }
    throw new OllamaError("invalid_response", detail || `Ollama returned ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new OllamaError("invalid_response", "Ollama returned invalid JSON", { cause: error });
  }
  return parseEmbeddingResponse(payload, inputs.length);
}

function parseEmbeddingResponse(payload: unknown, expectedCount: number): number[][] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new OllamaError("invalid_response", "Ollama response is not an object");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.model !== "string" || record.model.length === 0 || !Array.isArray(record.embeddings)) {
    throw new OllamaError("invalid_response", "Ollama response has no model or embeddings");
  }
  if (record.embeddings.length !== expectedCount) {
    throw new OllamaError("invalid_response", "Ollama returned a different embedding count");
  }
  const embeddings: number[][] = [];
  let dimensions: number | undefined;
  for (const value of record.embeddings) {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      throw new OllamaError("invalid_response", "Ollama returned an invalid embedding");
    }
    if (dimensions !== undefined && value.length !== dimensions) {
      throw new OllamaError("invalid_response", "Ollama returned inconsistent dimensions");
    }
    dimensions = value.length;
    embeddings.push(value as number[]);
  }
  return embeddings;
}
