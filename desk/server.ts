import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import type { Conversation } from "../src/domain/types";
import {
  CONVERSATION_FILE_NAME,
  OPENED_MARKS_NAME,
  parseOpenedMarks,
  readDeskFiles,
  serializeOpenedMarks,
} from "../src/desk/files";
import type { OpenedMarks } from "../src/desk/album";

const HOST = "127.0.0.1";
const PORT = 4737;
const deskRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const folder = process.argv[2];
if (!folder) {
  console.error("保存フォルダを指定する。例: npm run desk -- /mnt/f/trailogue");
  process.exit(1);
}

const root = resolve(folder);
const rootStat = await stat(root).catch(() => null);
if (!rootStat?.isDirectory()) {
  console.error(`フォルダを読めない: ${root}`);
  process.exit(1);
}

const loaded = await loadFolder(root);
let opened = await loadOpenedMarks(root);

const vite = await createViteServer({
  configFile: join(deskRoot, "vite.config.ts"),
  root: deskRoot,
  server: {
    middlewareMode: true,
    host: HOST,
    fs: { allow: [repoRoot] },
  },
  appType: "spa",
});

const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`机を開きました http://${HOST}:${PORT}`);
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/album") {
      sendJson(response, 200, {
        unreadable: loaded.unreadable,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        opened,
        records: loaded.records,
      });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/conversations/".length));
      const conversation = loaded.conversations.get(id);
      if (!conversation) {
        sendJson(response, 404, { error: "記録がありません" });
        return;
      }
      sendJson(response, 200, conversation);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/opened") {
      const body = await readBody(request);
      const contentHash = typeof body.contentHash === "string" ? body.contentHash : "";
      if (!CONVERSATION_FILE_NAME.test(`${contentHash}.json`) || !loaded.hashes.has(contentHash)) {
        sendJson(response, 400, { error: "開いた記録がありません" });
        return;
      }
      opened = { ...opened, [contentHash]: new Date().toISOString() };
      await writeOpenedMarks(root, opened);
      sendJson(response, 200, { opened });
      return;
    }
    vite.middlewares(request, response, () => {
      sendJson(response, 404, { error: "見当たりません" });
    });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "机を読めませんでした" });
  }
}

async function loadFolder(directory: string): Promise<{
  records: Awaited<ReturnType<typeof readDeskFiles>>["records"];
  conversations: Map<string, Conversation>;
  hashes: Set<string>;
  unreadable: number;
}> {
  const names = await readdir(directory);
  const files: { name: string; text: string }[] = [];
  for (const name of names) {
    if (!CONVERSATION_FILE_NAME.test(name)) continue;
    files.push({ name, text: await readFile(join(directory, name), "utf8") });
  }
  const listing = await readDeskFiles(files);
  const conversations = new Map(listing.conversations.map((conversation) => [conversation.id, conversation]));
  const hashes = new Set(listing.records.map((record) => record.contentHash));
  return { records: listing.records, conversations, hashes, unreadable: listing.unreadable };
}

async function loadOpenedMarks(directory: string): Promise<OpenedMarks> {
  try {
    return parseOpenedMarks(await readFile(join(directory, OPENED_MARKS_NAME), "utf8"));
  } catch {
    return {};
  }
}

async function writeOpenedMarks(directory: string, marks: OpenedMarks): Promise<void> {
  const path = join(directory, OPENED_MARKS_NAME);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, serializeOpenedMarks(marks));
  await rename(temporary, path);
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2048) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          resolveBody({});
          return;
        }
        resolveBody(parsed as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}
