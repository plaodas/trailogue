import { classifyPage } from "../../capture/page";
import type { MessageRole, ParseResult, RawCapture, RawMessage } from "../../domain/types";

export const parserVersion = "chatgpt-2";

export type ChatgptParseOptions = {
  documentReady?: boolean;
};

export function parse(
  document: Document,
  url: string,
  options: ChatgptParseOptions = {},
): ParseResult {
  const page = classifyPage(url);
  if (page?.provider !== "chatgpt") return { ok: false, code: "unsupported_page" };

  const ready = options.documentReady ?? true;
  if (page.sourceKind === "shared") return parseShared(document, url, page.pathId, ready);
  return parseConversation(document, url, page.pathId, ready);
}

function parseShared(
  document: Document,
  url: string,
  pathId: string,
  ready: boolean,
): ParseResult {
  const script = document.querySelector("script#__WEB_MOBILE_DATA__");
  if (!script?.textContent) {
    return { ok: false, code: ready ? "unrecognized_structure" : "not_ready" };
  }

  let data: unknown;
  try {
    data = JSON.parse(script.textContent);
  } catch {
    return { ok: false, code: "unrecognized_structure" };
  }
  if (!isRecord(data) || !isRecord(data.conversation)) {
    return { ok: false, code: "unrecognized_structure" };
  }

  const conversation = data.conversation;
  if (!Array.isArray(conversation.messages)) {
    return { ok: false, code: "incomplete_conversation" };
  }

  const userCount = conversation.messages.filter(
    (message) => isRecord(message) && message.role === "user",
  ).length;
  if (
    typeof conversation.userMessageCount === "number" &&
    conversation.userMessageCount !== userCount
  ) {
    return { ok: false, code: "incomplete_conversation" };
  }
  if (conversation.messages.length === 0) return { ok: false, code: "empty_conversation" };

  return {
    ok: true,
    capture: capture(
      url,
      pathId,
      "shared",
      titleFrom(conversation.title),
      conversation.messages.map((message, ordinal) => sharedMessage(message, ordinal)),
    ),
  };
}

function parseConversation(
  document: Document,
  url: string,
  pathId: string,
  ready: boolean,
): ParseResult {
  if (document.querySelector("[data-virtualized-turn-content]")) {
    return { ok: false, code: "incomplete_conversation" };
  }

  const turns = [...document.querySelectorAll("[data-chatgpt-search-message-ids]")].filter(
    (element) => !element.parentElement?.closest("[data-chatgpt-search-message-ids]"),
  );
  if (turns.length === 0) {
    return { ok: false, code: ready ? "unrecognized_structure" : "not_ready" };
  }

  const messages = turns.map((turn, ordinal) => conversationMessage(turn, ordinal));
  if (messages.some((message) => message.role === "assistant" && message.content.trim().length === 0)) {
    return { ok: false, code: "not_ready" };
  }

  return {
    ok: true,
    capture: capture(url, pathId, "conversation", titleFrom(document.title), messages),
  };
}

function sharedMessage(message: unknown, ordinal: number): RawMessage {
  if (!isRecord(message)) return { ordinal, role: "unknown", content: "" };
  const providerMessageId = typeof message.id === "string" && message.id.length > 0 ? message.id : undefined;
  return {
    ordinal,
    role: roleFrom(message.role),
    content: typeof message.content === "string" ? message.content : "",
    ...(providerMessageId ? { providerMessageId } : {}),
  };
}

function conversationMessage(turn: Element, ordinal: number): RawMessage {
  const ids = turn.getAttribute("data-chatgpt-search-message-ids")?.split(/\s+/).filter(Boolean) ?? [];
  const providerMessageId = ids[0];
  const role = conversationRole(turn);
  const body =
    role === "assistant"
      ? turn.querySelector("[data-markdown-text-style='assistant-message']")
      : turn.querySelector("[data-search-result-target]");
  return {
    ordinal,
    role,
    content: body ? elementText(body) : "",
    ...(providerMessageId ? { providerMessageId } : {}),
  };
}

function conversationRole(turn: Element): MessageRole {
  const unit = turn.getAttribute("data-chatgpt-search-unit-key") ?? "";
  const heading = turn.querySelector("h4") ?? (turn.previousElementSibling?.tagName === "H4" ? turn.previousElementSibling : null);
  if (
    heading?.getAttribute("data-conversation-role") === "assistant" ||
    unit.endsWith(":assistant")
  ) {
    return "assistant";
  }
  if (heading?.textContent?.trim() === "あなたの発言:" || unit.endsWith(":user")) return "user";
  return "unknown";
}

function elementText(root: Element): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.localName === "br") {
      parts.push("\n");
      return;
    }
    const block =
      element !== root &&
      ["p", "div", "li", "pre", "h1", "h2", "h3", "blockquote"].includes(element.localName);
    if (block && parts.length > 0 && !parts.at(-1)?.endsWith("\n")) parts.push("\n");
    for (const child of element.childNodes) visit(child);
    if (block && parts.length > 0 && !parts.at(-1)?.endsWith("\n")) parts.push("\n");
  };
  for (const child of root.childNodes) visit(child);
  return parts.join("");
}

function capture(
  url: string,
  sourceId: string,
  sourceKind: RawCapture["sourceKind"],
  title: string | null,
  messages: RawMessage[],
): RawCapture {
  return {
    provider: "chatgpt",
    sourceUrl: url,
    sourceId,
    sourceKind,
    title,
    parserVersion,
    messages,
  };
}

function titleFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (title.length === 0 || title === "ChatGPT") return null;
  return title;
}

function roleFrom(value: unknown): MessageRole {
  if (value === "user") return "user";
  if (value === "assistant") return "assistant";
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
