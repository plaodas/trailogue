import type { ProviderId, SourceKind } from "../domain/types";

export type PageMatch = {
  provider: ProviderId;
  sourceKind: SourceKind;
  pathId: string;
};

const PAGES: ReadonlyArray<{
  provider: ProviderId;
  sourceKind: SourceKind;
  host: string;
  prefix: string;
}> = [
  {
    provider: "copilot",
    sourceKind: "conversation",
    host: "copilot.cloud.microsoft",
    prefix: "/chat/conversation/",
  },
  {
    provider: "copilot",
    sourceKind: "shared",
    host: "copilot.cloud.microsoft",
    prefix: "/chat/share/",
  },
  {
    provider: "chatgpt",
    sourceKind: "conversation",
    host: "chatgpt.com",
    prefix: "/c/",
  },
  {
    provider: "chatgpt",
    sourceKind: "shared",
    host: "chatgpt.com",
    prefix: "/share/",
  },
];

export function classifyPage(value: string): PageMatch | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const page = PAGES.find(
    (candidate) =>
      url.hostname === candidate.host && url.pathname.startsWith(candidate.prefix),
  );
  if (!page) return null;

  const pathId = url.pathname.slice(page.prefix.length);
  if (pathId.length === 0 || pathId.includes("/")) return null;
  return {
    provider: page.provider,
    sourceKind: page.sourceKind,
    pathId,
  };
}
