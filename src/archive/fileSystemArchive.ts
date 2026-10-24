import type { TrailogueDatabase } from "../storage/db";
import {
  findConversationFile,
  listConversationFiles,
  removeConversationFile,
  writeConversationFile,
  type ArchiveDirectory,
  type ArchiveListing,
} from "./conversationFile";
import type { Conversation } from "../domain/types";

export type ArchiveConnection = "ready" | "needs_permission" | "missing";

export type ConversationArchive = {
  connection(): Promise<ArchiveConnection>;
  openFolder(): Promise<ArchiveConnection>;
  findByHash(contentHash: string): Promise<Conversation | undefined>;
  write(conversation: Conversation): Promise<void>;
  remove(conversation: Conversation): Promise<boolean>;
  list(): Promise<ArchiveListing>;
};

export type ArchiveDirectoryGrant = ArchiveDirectory & {
  queryPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
};

export type ArchivePort = {
  load(): Promise<ArchiveDirectoryGrant | null>;
  store(grant: ArchiveDirectoryGrant): Promise<void>;
  pick(): Promise<ArchiveDirectoryGrant>;
};

const HANDLE_ID = "directory";

export function createArchive(port: ArchivePort): ConversationArchive {
  async function readyGrant(): Promise<ArchiveDirectoryGrant> {
    const grant = await port.load();
    if (!grant || (await grant.queryPermission()) !== "granted") {
      throw new Error("archive unavailable");
    }
    return grant;
  }

  return {
    async connection() {
      const grant = await port.load();
      if (!grant) return "missing";
      const state = await grant.queryPermission();
      return state === "granted" ? "ready" : "needs_permission";
    },
    async openFolder() {
      const existing = await port.load();
      if (existing && (await existing.requestPermission()) === "granted") return "ready";
      try {
        const picked = await port.pick();
        await port.store(picked);
        return "ready";
      } catch (error) {
        if (isCancel(error)) return existing ? "needs_permission" : "missing";
        throw error;
      }
    },
    async findByHash(contentHash) {
      return findConversationFile(await readyGrant(), contentHash);
    },
    async write(conversation) {
      await writeConversationFile(await readyGrant(), conversation);
    },
    async remove(conversation) {
      return removeConversationFile(await readyGrant(), conversation);
    },
    async list() {
      return listConversationFiles(await readyGrant());
    },
  };
}

export function createFileSystemArchive(db: TrailogueDatabase): ConversationArchive {
  const handles = new WeakMap<ArchiveDirectoryGrant, FileSystemDirectoryHandle>();

  function bind(handle: FileSystemDirectoryHandle): ArchiveDirectoryGrant {
    const grant = grantOf(handle);
    handles.set(grant, handle);
    return grant;
  }

  return createArchive({
    async load() {
      const row = await db.archiveHandles.get(HANDLE_ID);
      return row ? bind(row.handle) : null;
    },
    async store(grant) {
      const handle = handles.get(grant);
      if (!handle) throw new Error("archive handle missing");
      await db.archiveHandles.put({ id: HANDLE_ID, handle });
    },
    async pick() {
      const handle = await chooseDirectory();
      return bind(handle);
    },
  });
}

function grantOf(handle: FileSystemDirectoryHandle): ArchiveDirectoryGrant {
  const directory = asDirectory(handle);
  return {
    queryPermission: () => directory.queryPermission({ mode: "readwrite" }),
    requestPermission: () => directory.requestPermission({ mode: "readwrite" }),
    read: (name) => readFile(directory, name),
    write: (name, contents) => writeFile(directory, name, contents),
    remove: (name) => removeFile(handle, name),
    list: () => listJsonFiles(directory),
  };
}

function asDirectory(handle: FileSystemDirectoryHandle): ReadableDirectory {
  return handle as ReadableDirectory;
}

async function chooseDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) throw new Error("archive unavailable");
  return picker({ id: "trailogue-archive", mode: "readwrite" });
}

async function readFile(handle: ReadableDirectory, name: string): Promise<string | null> {
  try {
    const fileHandle = await handle.getFileHandle(name);
    return await (await fileHandle.getFile()).text();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function writeFile(handle: ReadableDirectory, name: string, contents: string): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(contents);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function removeFile(handle: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await handle.removeEntry(name);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}

async function listJsonFiles(handle: ReadableDirectory): Promise<{ name: string; text: string }[]> {
  const files: { name: string; text: string }[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !name.endsWith(".json")) continue;
    const fileHandle = entry as FileSystemFileHandle;
    files.push({ name, text: await (await fileHandle.getFile()).text() });
  }
  return files;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function isCancel(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

type DirectoryPicker = (options: { id: string; mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;

type ReadableDirectory = FileSystemDirectoryHandle & {
  queryPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};
