import { classifyPage } from "../../capture/page";
import type { ParseResult } from "../../domain/types";

export const parserVersion = "chatgpt-1";

export function parse(_document: Document, url: string): ParseResult {
  const page = classifyPage(url);
  if (page?.provider !== "chatgpt") return { ok: false, code: "unsupported_page" };
  return { ok: false, code: "unrecognized_structure" };
}
