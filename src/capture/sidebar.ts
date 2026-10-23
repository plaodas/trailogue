export const SIDEBAR_LIST_REQUEST = "trailogue:sidebar-list";

export type SidebarConversation = {
  id: string;
  title: string;
};

const COPILOT_ORIGIN = "https://copilot.cloud.microsoft";
const COPILOT_PREFIX = "/chat/conversation/";

export function isSidebarListRequest(message: unknown): boolean {
  return isRecord(message) && message.type === SIDEBAR_LIST_REQUEST;
}

export function copilotConversationIds(document: Document): SidebarConversation[] {
  const marked = new Set<string>();
  for (const element of document.querySelectorAll("[data-chat-history-more-button-conversation-id]")) {
    const id = element.getAttribute("data-chat-history-more-button-conversation-id");
    if (id && isConversationId(id)) marked.add(id);
  }
  return sidebarConversations(document, COPILOT_ORIGIN, COPILOT_PREFIX, (id) => marked.has(id));
}

export function copilotConversationUrl(id: string): string {
  return `${COPILOT_ORIGIN}${COPILOT_PREFIX}${id}`;
}

export function isConversationId(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("?") && !value.includes("#");
}

export function isSidebarConversationList(value: unknown): value is SidebarConversation[] {
  return Array.isArray(value) && value.every(isSidebarConversation);
}

function sidebarConversations(
  document: Document,
  origin: string,
  prefix: string,
  accept: (id: string, anchor: Element) => boolean,
): SidebarConversation[] {
  const items: SidebarConversation[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const id = pathId(anchor.getAttribute("href") ?? "", origin, prefix);
    if (!id || seen.has(id) || !accept(id, anchor)) continue;
    seen.add(id);
    items.push({ id, title: anchor.textContent?.trim() ?? "" });
  }
  return items;
}

function isSidebarConversation(value: unknown): value is SidebarConversation {
  return isRecord(value)
    && typeof value.id === "string"
    && isConversationId(value.id)
    && typeof value.title === "string";
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
