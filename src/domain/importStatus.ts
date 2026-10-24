import { sha256Hex } from "./hash";
import { normalizeContent } from "./normalize";
import type { MessageRole } from "./types";

export type ImportDifference = "extended" | "shortened" | "window" | "diverged";

export type ImportRelation =
  | { kind: "same" }
  | { kind: "absent" }
  | { kind: "different"; reason: ImportDifference };

export type FingerprintMessage = {
  ordinal?: number;
  role: MessageRole;
  content: string;
};

export async function messageFingerprint(message: {
  role: MessageRole;
  content: string;
}): Promise<string> {
  return sha256Hex(JSON.stringify({
    role: message.role,
    content: normalizeContent(message.content),
  }));
}

export async function messageFingerprints(
  messages: readonly FingerprintMessage[],
): Promise<string[]> {
  const ordered = messages.map((message, index) => ({ message, index })).sort(
    (left, right) => (left.message.ordinal ?? left.index) - (right.message.ordinal ?? right.index)
      || left.index - right.index,
  );
  const fingerprints: string[] = [];
  for (const item of ordered) fingerprints.push(await messageFingerprint(item.message));
  return fingerprints;
}

export function relateImport(
  current: readonly string[],
  generations: readonly (readonly string[])[],
): ImportRelation {
  if (generations.some((generation) => sameSequence(current, generation))) return { kind: "same" };
  if (generations.length === 0) return { kind: "absent" };
  if (generations.some((generation) => isStrictPrefix(generation, current))) {
    return { kind: "different", reason: "extended" };
  }
  if (generations.some((generation) => isStrictPrefix(current, generation))) {
    return { kind: "different", reason: "shortened" };
  }
  if (generations.some((generation) => isWindow(current, generation))) {
    return { kind: "different", reason: "window" };
  }
  return { kind: "different", reason: "diverged" };
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isStrictPrefix(prefix: readonly string[], whole: readonly string[]): boolean {
  return prefix.length < whole.length && prefix.every((item, index) => item === whole[index]);
}

function isWindow(slice: readonly string[], whole: readonly string[]): boolean {
  if (slice.length === 0 || slice.length >= whole.length) return false;
  for (let start = 1; start <= whole.length - slice.length; start += 1) {
    if (slice.every((item, index) => item === whole[start + index])) return true;
  }
  return false;
}
