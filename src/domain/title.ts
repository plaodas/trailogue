import type { MessageRole } from "./types";

const SITE_TITLES = new Set(["Microsoft Copilot", "ChatGPT"]);

export function displayTitle(
  rawTitle: string | null,
  messages: ReadonlyArray<{ role: MessageRole; content: string }>,
): string {
  const heading = rawTitle?.trim() ?? "";
  if (heading.length > 0 && !SITE_TITLES.has(heading)) return heading;
  const firstUser = messages.find((message) => message.role === "user");
  return Array.from(firstUser?.content ?? "").slice(0, 80).join("");
}
