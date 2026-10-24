import type { MessageRole, ProviderId } from "./types";

export type HashMessage = {
  ordinal: number;
  role: MessageRole;
  content: string;
};

export function canonicalContent(input: {
  provider: ProviderId;
  sourceId: string;
  messages: ReadonlyArray<HashMessage>;
}): string {
  return JSON.stringify({
    v: 1,
    provider: input.provider,
    sourceId: input.sourceId,
    messages: input.messages.map((message) => ({
      ordinal: message.ordinal,
      role: message.role,
      content: message.content,
    })),
  });
}

export async function contentHash(input: {
  provider: ProviderId;
  sourceId: string;
  messages: ReadonlyArray<HashMessage>;
}): Promise<string> {
  return sha256Hex(canonicalContent(input));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
