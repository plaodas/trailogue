import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserGate, detectBrave } from "../../src/ui/browserGate";
import { copy } from "../../src/ui/copy";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "brave");
});

describe("BrowserGate", () => {
  it("hides children until detection finishes", () => {
    render(
      <BrowserGate detect={() => new Promise(() => undefined)}>
        <button type="button">保存</button>
        <p>Copilotのサイドバーの会話を順に取り込む</p>
      </BrowserGate>,
    );
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByText("Copilotのサイドバーの会話を順に取り込む")).toBeNull();
    expect(screen.queryByText(copy.unsupportedBrowser)).toBeNull();
  });

  it("shows only the sentence when the browser is Brave", async () => {
    render(
      <BrowserGate detect={async () => true}>
        <button type="button">保存</button>
        <p>Copilotのサイドバーの会話を順に取り込む</p>
      </BrowserGate>,
    );
    expect(await screen.findByText(copy.unsupportedBrowser)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByText("Copilotのサイドバーの会話を順に取り込む")).toBeNull();
  });

  it("shows children when the browser is supported", async () => {
    render(
      <BrowserGate detect={async () => false}>
        <p>一覧</p>
      </BrowserGate>,
    );
    expect(await screen.findByText("一覧")).toBeTruthy();
    expect(screen.queryByText(copy.unsupportedBrowser)).toBeNull();
  });
});

describe("detectBrave", () => {
  it("is false when isBrave is missing", async () => {
    expect(await detectBrave()).toBe(false);
  });

  it("is false when isBrave rejects", async () => {
    Object.defineProperty(navigator, "brave", {
      configurable: true,
      value: { isBrave: () => Promise.reject(new Error("unavailable")) },
    });
    expect(await detectBrave()).toBe(false);
  });

  it("is true only when isBrave resolves true", async () => {
    Object.defineProperty(navigator, "brave", {
      configurable: true,
      value: { isBrave: async () => true },
    });
    expect(await detectBrave()).toBe(true);
  });
});
