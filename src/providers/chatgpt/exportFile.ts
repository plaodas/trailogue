const LOCAL_HEADER = 0x04034b50;
const HEADER_BYTES = 30;

export async function readExportFile(bytes: Uint8Array): Promise<unknown | null> {
  try {
    const text = isZip(bytes) ? await conversationsText(bytes) : decodeText(bytes);
    if (text === null) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && readUint32(bytes, 0) === LOCAL_HEADER;
}

async function conversationsText(bytes: Uint8Array): Promise<string | null> {
  let offset = 0;
  let found: { depth: number; bytes: Uint8Array } | null = null;
  while (offset + HEADER_BYTES <= bytes.length) {
    if (readUint32(bytes, offset) !== LOCAL_HEADER) break;
    const flags = readUint16(bytes, offset + 6);
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + HEADER_BYTES;
    const dataStart = nameStart + nameLength + extraLength;
    if ((flags & 0x1) !== 0) return null;
    if ((flags & 0x8) !== 0 && compressedSize === 0) return null;
    if (dataStart + compressedSize > bytes.length) return null;
    const name = decodeText(bytes.subarray(nameStart, nameStart + nameLength));
    if (isConversationsName(name)) {
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      const inflated = await inflateEntry(compressed, method);
      if (!inflated) return null;
      const depth = name.replaceAll("\\", "/").split("/").length;
      if (!found || depth < found.depth) found = { depth, bytes: inflated };
    }
    offset = dataStart + compressedSize;
    if ((flags & 0x8) !== 0) {
      const signed = offset + 4 <= bytes.length && readUint32(bytes, offset) === 0x08074b50;
      const descriptor = signed ? 16 : 12;
      if (offset + descriptor > bytes.length) return null;
      offset += descriptor;
    }
  }
  return found ? decodeText(found.bytes) : null;
}

function isConversationsName(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return normalized === "conversations.json" || normalized.endsWith("/conversations.json");
}

async function inflateEntry(bytes: Uint8Array, method: number): Promise<Uint8Array | null> {
  if (method === 0) return Uint8Array.from(bytes);
  if (method !== 8) return null;
  try {
    const copy = Uint8Array.from(bytes);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}
