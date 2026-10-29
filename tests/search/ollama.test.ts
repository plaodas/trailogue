import { describe, expect, it, vi } from "vitest";
import { embedTexts, OLLAMA_EMBED_URL, OllamaError } from "../../src/search/ollama";

describe("Ollama embeddings", () => {
  it("posts an untruncated batch only to the fixed local endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ model: "embeddinggemma:latest", embeddings: [[1, 0], [0, 1]] }),
    );
    await expect(embedTexts("embeddinggemma", ["一", "二"], { fetch: fetcher })).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(OLLAMA_EMBED_URL);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "embeddinggemma",
      input: ["一", "二"],
      truncate: false,
    });
  });

  it("returns no vectors without contacting Ollama for an empty batch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(embedTexts("model", [], { fetch: fetcher })).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("distinguishes a missing model and an oversized input", async () => {
    const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response("model not found", { status: 404 }));
    await expect(embedTexts("missing", ["x"], { fetch: missing })).rejects.toMatchObject({
      code: "model_not_found",
    });

    const long = vi.fn<typeof fetch>().mockResolvedValue(new Response("input exceeds context length", { status: 400 }));
    await expect(embedTexts("model", ["x"], { fetch: long })).rejects.toMatchObject({
      code: "input_too_long",
    });
  });

  it("rejects unavailable and malformed responses", async () => {
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connect"));
    await expect(embedTexts("model", ["x"], { fetch: unavailable })).rejects.toBeInstanceOf(OllamaError);
    await expect(embedTexts("model", ["x"], { fetch: unavailable })).rejects.toMatchObject({ code: "unavailable" });

    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ model: "model", embeddings: [[1], [2]] }));
    await expect(embedTexts("model", ["x"], { fetch: malformed })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
