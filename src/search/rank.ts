import type { MessageRole, ProviderId } from "../domain/types";

export type SemanticCandidate = {
  conversationId: string;
  messageId: string;
  ordinal: number;
  role: MessageRole;
  content: string;
  title: string;
  provider: ProviderId;
  capturedAt: string;
  contentHash: string;
  vector: readonly number[];
};

export type SemanticMatch = Omit<SemanticCandidate, "vector">;

export class InvalidVectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVectorError";
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  assertVector(left, "left");
  assertVector(right, "right");
  if (left.length !== right.length) throw new InvalidVectorError("vector dimensions differ");

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] as number;
    const rightValue = right[index] as number;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) throw new InvalidVectorError("zero vector");
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function rankSemanticMatches(
  queryVector: readonly number[],
  candidates: readonly SemanticCandidate[],
  excludedLocations: ReadonlySet<string> = new Set(),
  limit = 20,
): SemanticMatch[] {
  assertVector(queryVector, "query");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be a non-negative integer");

  const seen = new Set<string>();
  const ranked: { candidate: SemanticCandidate; similarity: number }[] = [];
  for (const candidate of candidates) {
    const key = semanticLocationKey(candidate.contentHash, candidate.messageId);
    if (excludedLocations.has(key) || seen.has(key)) continue;
    seen.add(key);
    ranked.push({ candidate, similarity: cosineSimilarity(queryVector, candidate.vector) });
  }

  ranked.sort((left, right) => {
    if (left.similarity !== right.similarity) return right.similarity - left.similarity;
    return byLocation(left.candidate, right.candidate);
  });

  return ranked.slice(0, limit).map(({ candidate }) => {
    const { vector: _vector, ...match } = candidate;
    return match;
  });
}

export function semanticLocationKey(contentHash: string, messageId: string): string {
  return `${contentHash}:${messageId}`;
}

export function validVector(vector: unknown, dimensions?: number): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    (dimensions === undefined || vector.length === dimensions) &&
    vector.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function assertVector(vector: readonly number[], label: string): void {
  if (!validVector(vector)) throw new InvalidVectorError(`${label} vector is invalid`);
}

function byLocation(left: SemanticCandidate, right: SemanticCandidate): number {
  if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? -1 : 1;
  if (left.conversationId !== right.conversationId) {
    return left.conversationId < right.conversationId ? -1 : 1;
  }
  return left.ordinal - right.ordinal;
}
