export const SIDEBAR_LIST_REQUEST = "trailogue:sidebar-list";

const COPILOT_ORIGIN = "https://copilot.cloud.microsoft";
const COPILOT_PREFIX = "/chat/conversation/";
const CHATGPT_ORIGIN = "https://chatgpt.com";
const CHATGPT_PREFIX = "/c/";
const CHATGPT_KEY_PREFIX = "chatgpt:conversation:";

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
    const id = pathId(anchor.getAttribute("href") ?? "", COPILOT_ORIGIN, COPILOT_PREFIX);
    if (!id || !marked.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function copilotConversationUrl(id: string): string {
  return `${COPILOT_ORIGIN}${COPILOT_PREFIX}${id}`;
}

export function chatgptConversationIds(document: Document): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const id = pathId(anchor.getAttribute("href") ?? "", CHATGPT_ORIGIN, CHATGPT_PREFIX);
    if (!id || seen.has(id)) continue;
    const key = anchor.closest("[data-sidebar-chatgpt-conversation-key]")
      ?.getAttribute("data-sidebar-chatgpt-conversation-key");
    if (key !== `${CHATGPT_KEY_PREFIX}${id}`) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function chatgptConversationUrl(id: string): string {
  return `${CHATGPT_ORIGIN}${CHATGPT_PREFIX}${id}`;
}

export function isConversationId(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("?") && !value.includes("#");
}

export function isConversationIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && isConversationId(item));
}

function pathId(href: string, origin: string, prefix: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(href, origin).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length);
  if (!isConversationId(id)) return null;
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
