export const SIDEBAR_LIST_REQUEST = "trailogue:sidebar-list";

const CONVERSATION_ORIGIN = "https://copilot.cloud.microsoft";
const CONVERSATION_PREFIX = "/chat/conversation/";

export function isSidebarListRequest(message: unknown): boolean {
  return isRecord(message) && message.type === SIDEBAR_LIST_REQUEST;
}

export function copilotConversationIds(document: Document): string[] {
  const marked = new Set<string>();
  for (const element of document.querySelectorAll("[data-chat-history-more-button-conversation-id]")) {
    const id = element.getAttribute("data-chat-history-more-button-conversation-id");
    if (id && isConversationId(id)) marked.add(id);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const id = conversationIdFromHref(anchor.getAttribute("href") ?? "");
    if (!id || !marked.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function copilotConversationUrl(id: string): string {
  return `${CONVERSATION_ORIGIN}${CONVERSATION_PREFIX}${id}`;
}

export function isConversationId(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("?") && !value.includes("#");
}

export function isConversationIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && isConversationId(item));
}

function conversationIdFromHref(href: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(href, CONVERSATION_ORIGIN).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(CONVERSATION_PREFIX)) return null;
  const id = pathname.slice(CONVERSATION_PREFIX.length);
  if (!isConversationId(id)) return null;
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
