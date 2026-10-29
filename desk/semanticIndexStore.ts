import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseSemanticIndex,
  serializeSemanticIndex,
  type SemanticIndex,
} from "../src/search/semanticIndex";

export const TRAILOGUE_DERIVED_DIRECTORY = ".trailogue";
export const SEMANTIC_INDEX_FILE = "semantic-index-v1.json";

export async function readSemanticIndexFile(root: string): Promise<SemanticIndex | undefined> {
  try {
    return parseSemanticIndex(await readFile(indexPath(root), "utf8"));
  } catch {
    return undefined;
  }
}

export async function writeSemanticIndexFile(root: string, index: SemanticIndex): Promise<void> {
  const directory = join(root, TRAILOGUE_DERIVED_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const path = indexPath(root);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, serializeSemanticIndex(index), "utf8");
  await rename(temporary, path);
}

function indexPath(root: string): string {
  return join(root, TRAILOGUE_DERIVED_DIRECTORY, SEMANTIC_INDEX_FILE);
}
