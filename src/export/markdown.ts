import type { Conversation, MessageRole, ProviderId } from "../domain/types";

export function toMarkdown(conversation: Conversation): string {
  const messages = [...conversation.messages].sort((left, right) => left.ordinal - right.ordinal);
  const header = [
    `# ${conversation.title}`,
    "",
    `- Provider: ${conversation.provider}`,
    `- Source: ${conversation.sourceUrl}`,
    `- Captured: ${conversation.capturedAt}`,
    `- Parser: ${conversation.parserVersion}`,
    "",
    "---",
    "",
    "",
  ].join("\n");
  const sections = messages.map((message) => {
    const label = roleName(conversation.provider, message.role);
    return `**${message.ordinal + 1}. ${label}**\n\n${message.content}`;
  });
  return `${header}${sections.join("\n\n---\n\n")}\n`;
}

const UNSAFE_FILENAME = new Set(["\\", "/", ":", "*", "?", "\"", "<", ">", "|"]);

export function markdownFilename(title: string): string {
  const cleaned = [...title]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && !UNSAFE_FILENAME.has(character);
    })
    .join("")
    .trim();
  return `${cleaned.length > 0 ? cleaned : "trailogue"}.md`;
}

function roleName(provider: ProviderId, role: MessageRole): string {
  if (role === "user") return "ユーザー";
  if (role === "unknown") return "不明";
  return provider === "copilot" ? "Copilot" : "ChatGPT";
}
