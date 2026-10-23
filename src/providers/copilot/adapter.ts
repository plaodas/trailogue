import { classifyPage } from "../../capture/page";
import type { ParseResult, RawCapture, RawMessage } from "../../domain/types";
import {
  hydrationScriptText,
  parseHydrationScript,
  selectHydrationScript,
  type RetainedHydration,
} from "./hydration";

export const parserVersion = "copilot-1";

const LOADER_KEY = {
  conversation: "chat-history",
  shared: "chat-share-redeem",
} as const;

export type CopilotParseOptions = {
  retainedScriptText?: string;
  retainedPath?: string;
  documentReady?: boolean;
};

export function parse(
  document: Document,
  url: string,
  options: CopilotParseOptions = {},
): ParseResult {
  const page = classifyPage(url);
  if (page?.provider !== "copilot") return { ok: false, code: "unsupported_page" };

  const retained = retainedScript(options);
  const script = selectHydrationScript(
    hydrationScriptText(document),
    retained,
    url,
  );
  const ready = options.documentReady ?? true;

  if (!script) {
    if (!ready) return { ok: false, code: "not_ready" };
    if (document.getElementById("m365-copilot-app-layout-root")) {
      return { ok: false, code: "incomplete_conversation" };
    }
    return { ok: false, code: "unrecognized_structure" };
  }

  const data = parseHydrationScript(script);
  const raw = rawConversation(data, LOADER_KEY[page.sourceKind]);
  if (!raw) {
    if (!ready) return { ok: false, code: "not_ready" };
    if (document.getElementById("m365-copilot-app-layout-root")) {
      return { ok: false, code: "incomplete_conversation" };
    }
    return { ok: false, code: "unrecognized_structure" };
  }

  const conversationId = stringValue(raw.conversationId);
  if (page.sourceKind === "conversation" && conversationId !== page.pathId) {
    return { ok: false, code: "incomplete_conversation" };
  }

  if (!Array.isArray(raw.messages)) {
    return { ok: false, code: "incomplete_conversation" };
  }

  const messageCount = debugMessageCount(raw);
  if (messageCount !== undefined && messageCount !== raw.messages.length) {
    return { ok: false, code: "incomplete_conversation" };
  }
  if (raw.messages.length === 0) return { ok: false, code: "empty_conversation" };

  const messages = raw.messages.map((message, ordinal) => toMessage(message, ordinal));

  const capture: RawCapture = {
    provider: "copilot",
    sourceUrl: url,
    sourceId: page.sourceKind === "shared" ? (conversationId ?? page.pathId) : page.pathId,
    sourceKind: page.sourceKind,
    title: stringValue(raw.chatName) ?? null,
    parserVersion,
    messages,
  };
  return { ok: true, capture };
}

function retainedScript(options: CopilotParseOptions): RetainedHydration | undefined {
  if (!options.retainedScriptText || !options.retainedPath) return undefined;
  return { text: options.retainedScriptText, path: options.retainedPath };
}

function rawConversation(
  data: unknown,
  key: (typeof LOADER_KEY)[keyof typeof LOADER_KEY],
): Record<string, unknown> | null {
  if (!isRecord(data) || !isRecord(data.loaderData)) return null;
  const loader = data.loaderData[key];
  if (!isRecord(loader) || !isRecord(loader.store)) return null;
  const raw = loader.store.rawConversationResponse;
  return isRecord(raw) ? raw : null;
}

function debugMessageCount(raw: Record<string, unknown>): number | undefined {
  if (!isRecord(raw.conversationDebugMetrics)) return undefined;
  const count = raw.conversationDebugMetrics.messageCount;
  return typeof count === "number" ? count : undefined;
}

function toMessage(message: unknown, ordinal: number): RawMessage {
  if (!isRecord(message)) return { ordinal, role: "unknown", content: "" };
  const providerMessageId = stringValue(message.messageId);
  return {
    ordinal,
    role: message.author === "user" ? "user" : message.author === "bot" ? "assistant" : "unknown",
    content: typeof message.text === "string" ? message.text : "",
    ...(providerMessageId ? { providerMessageId } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
