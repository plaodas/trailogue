import { describe, expect, it } from "vitest";
import {
  messageFingerprint,
  messageFingerprints,
  relateImport,
} from "../../src/domain/importStatus";
import type { MessageRole } from "../../src/domain/types";

const user = "user" as const;
const assistant = "assistant" as const;

describe("relateImport", () => {
  it("matches a generation and ignores older ones", () => {
    expect(relateImport(["a", "b"], [["a"], ["a", "b"], ["a", "b", "c"]])).toEqual({ kind: "same" });
  });

  it("is absent when no generation exists", () => {
    expect(relateImport(["a"], [])).toEqual({ kind: "absent" });
  });

  it("treats a saved prefix as extended before a longer saved generation", () => {
    expect(relateImport(["a", "b"], [["a"], ["a", "b", "c"]])).toEqual({
      kind: "different",
      reason: "extended",
    });
  });

  it("treats the current sequence as a strict prefix", () => {
    expect(relateImport(["a"], [["a", "b"]])).toEqual({ kind: "different", reason: "shortened" });
  });

  it("treats a middle slice as a window", () => {
    expect(relateImport(["b", "c"], [["a", "b", "c", "d"]])).toEqual({
      kind: "different",
      reason: "window",
    });
  });

  it("treats any other overlap as diverged", () => {
    expect(relateImport(["a", "x"], [["a", "b"]])).toEqual({ kind: "different", reason: "diverged" });
  });
});

describe("message fingerprints", () => {
  it("ignores surrounding whitespace, newline style, and ordinal", async () => {
    const marked: Array<{ ordinal: number; role: MessageRole; content: string }> = [
      { ordinal: 4, role: user, content: "  問\r\nい  " },
      { ordinal: 8, role: assistant, content: "答え" },
    ];
    const plain = [
      { role: user, content: "問\nい" },
      { role: assistant, content: "答え" },
    ];

    expect(await messageFingerprints(marked)).toEqual(await messageFingerprints(plain));
    expect(await messageFingerprint({ role: user, content: "問\nい" })).not.toBe(
      await messageFingerprint({ role: assistant, content: "問\nい" }),
    );
  });
});
