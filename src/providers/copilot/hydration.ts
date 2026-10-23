const MARKER = "window.__staticRouterHydrationData = JSON.parse(";

export type RetainedHydration = {
  text: string;
  path: string;
};

export function parseHydrationScript(script: string): unknown | null {
  const at = script.indexOf(MARKER);
  if (at < 0) return null;
  const start = at + MARKER.length;
  if (script[start] !== '"') return null;

  let end = start + 1;
  while (end < script.length) {
    const char = script[end];
    if (char === "\\") {
      end += 2;
      continue;
    }
    if (char === '"') break;
    end += 1;
  }
  if (script[end] !== '"') return null;

  try {
    const inner = JSON.parse(script.slice(start, end + 1));
    if (typeof inner !== "string") return null;
    return JSON.parse(inner);
  } catch {
    return null;
  }
}

export function hydrationScriptText(node: Node): string | null {
  const scripts: Element[] = [];
  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "script") {
    scripts.push(node as Element);
  }
  if ("querySelectorAll" in node) {
    scripts.push(...(node as ParentNode).querySelectorAll("script"));
  }

  let found: string | null = null;
  for (const script of scripts) {
    const text = script.textContent ?? "";
    if (text.includes(MARKER)) found = text;
  }
  return found;
}

export function retainHydrationScript(
  previous: RetainedHydration | undefined,
  added: Node,
  path: string,
): RetainedHydration | undefined {
  const text = hydrationScriptText(added);
  if (!text) return previous;
  return { text, path };
}

export function pagePath(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function selectHydrationScript(
  documentText: string | null,
  retained: RetainedHydration | undefined,
  pageUrl: string,
): string | null {
  if (documentText) return documentText;
  const path = pagePath(pageUrl);
  if (retained && path && retained.path === path) return retained.text;
  return null;
}
