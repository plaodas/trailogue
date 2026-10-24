import { describe, expect, it, vi } from "vitest";
import { createArchive, type ArchiveDirectoryGrant } from "../../src/archive/fileSystemArchive";
import { conversationFileName } from "../../src/archive/conversationFile";
import { normalize } from "../../src/domain/normalize";
import type { Conversation, RawCapture } from "../../src/domain/types";

describe("folder archive", () => {
  it("asks for a folder when none is stored and keeps the choice", async () => {
    let stored: ArchiveDirectoryGrant | null = null;
    const picked = memoryGrant("granted");
    const archive = createArchive({
      load: async () => stored,
      store: async (grant) => {
        stored = grant;
      },
      pick: async () => picked.grant,
    });

    expect(await archive.connection()).toBe("missing");
    expect(await archive.openFolder()).toBe("ready");
    expect(stored).toBe(picked.grant);
    expect(await archive.connection()).toBe("ready");
  });

  it("uses the saved folder when permission is granted again", async () => {
    const saved = memoryGrant("prompt");
    const pick = vi.fn(async () => memoryGrant("granted").grant);
    const archive = createArchive({
      load: async () => saved.grant,
      store: async () => {
        throw new Error("should keep the saved folder");
      },
      pick,
    });

    expect(await archive.connection()).toBe("needs_permission");
    expect(await archive.openFolder()).toBe("ready");
    expect(pick).not.toHaveBeenCalled();
    expect(await saved.grant.queryPermission()).toBe("granted");
  });

  it("stays disconnected when folder selection is cancelled", async () => {
    const store = vi.fn();
    const archive = createArchive({
      load: async () => null,
      store,
      pick: async () => {
        throw new DOMException("aborted", "AbortError");
      },
    });

    expect(await archive.openFolder()).toBe("missing");
    expect(store).not.toHaveBeenCalled();
  });

  it("does not overwrite a valid file through the archive", async () => {
    const saved = memoryGrant("granted");
    const archive = createArchive({
      load: async () => saved.grant,
      store: async () => undefined,
      pick: async () => saved.grant,
    });
    const conversation = await sample();
    await archive.write(conversation);
    const name = conversationFileName(conversation.contentHash);
    const original = await saved.grant.read(name);

    await archive.write({ ...conversation, title: "別の題" });

    expect(await saved.grant.read(name)).toBe(original);
    expect((await archive.findByHash(conversation.contentHash))?.title).toBe(conversation.title);
  });

  it("removes one verified file and leaves the folder and the other hash", async () => {
    const saved = memoryGrant("granted");
    const store = vi.fn(async () => undefined);
    const archive = createArchive({
      load: async () => saved.grant,
      store,
      pick: async () => saved.grant,
    });
    const first = await sample();
    const second = await sample("あとの問い", "record-2");
    await archive.write(first);
    await archive.write(second);

    expect(await archive.remove(first)).toBe(true);

    expect(await saved.grant.read(conversationFileName(first.contentHash))).toBeNull();
    expect((await archive.findByHash(second.contentHash))?.id).toBe(second.id);
    expect(store).not.toHaveBeenCalled();
  });

  it("does not remove a file that fails verification", async () => {
    const saved = memoryGrant("granted");
    const archive = createArchive({
      load: async () => saved.grant,
      store: async () => undefined,
      pick: async () => saved.grant,
    });
    const conversation = await sample();
    const name = conversationFileName(conversation.contentHash);
    await saved.grant.write(name, "{");

    expect(await archive.remove(conversation)).toBe(false);
    expect(await saved.grant.read(name)).toBe("{");
  });
});

function memoryGrant(permission: PermissionState): {
  grant: ArchiveDirectoryGrant;
  setPermission: (next: PermissionState) => void;
} {
  const files = new Map<string, string>();
  let state = permission;
  const grant: ArchiveDirectoryGrant = {
    async queryPermission() {
      return state;
    },
    async requestPermission() {
      state = "granted";
      return state;
    },
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, contents) {
      files.set(name, contents);
    },
    async remove(name) {
      files.delete(name);
    },
    async list() {
      return [...files].map(([name, text]) => ({ name, text }));
    },
  };
  return {
    grant,
    setPermission(next) {
      state = next;
    },
  };
}

function sample(content = "初めの問い", id = "record-1"): Promise<Conversation> {
  const raw: RawCapture = {
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/conversation-1",
    sourceId: "conversation-1",
    sourceKind: "conversation",
    title: "題",
    parserVersion: "chatgpt-1",
    messages: [{ ordinal: 0, role: "user", content }],
  };
  return normalize(raw, { id, capturedAt: "2026-01-01T00:00:00.000Z" });
}
