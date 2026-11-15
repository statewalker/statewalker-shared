import { describe, expect, it } from "vitest";
import { getAdapter } from "../src/get-adapter.js";

describe("getAdapter", () => {
  it("returns [get, remove] backed by the factory", () => {
    const [get, remove] = getAdapter<{ n: number }>("k", () => ({ n: 1 }));
    const ctx: Record<string, unknown> = {};
    expect(get(ctx)).toEqual({ n: 1 });
    remove(ctx);
    expect(get(ctx)).toEqual({ n: 1 });
  });

  it("caches the created value on the context", () => {
    const [get] = getAdapter<{ id: string }>("k", () => ({ id: "x" }));
    const ctx: Record<string, unknown> = {};
    expect(get(ctx)).toBe(get(ctx));
  });

  it("honors a custom getParent", () => {
    interface Node {
      up?: Node;
      k?: { n: number };
    }
    const [get] = getAdapter<{ n: number }, Node>(
      "k",
      () => ({ n: 0 }),
      (n) => n.up,
    );
    const root: Node = { k: { n: 99 } };
    const child: Node = { up: root };
    expect(get(child)).toEqual({ n: 99 });
  });
});

describe("getAdapter — default getParent (#39)", () => {
  it("does not inherit through `parent` by default, unlike newAdapter", () => {
    const [get] = getAdapter<{ n: number }>("k", () => ({ n: 0 }));
    const root: Record<string, unknown> = { k: { n: 99 } };
    const child: Record<string, unknown> = { parent: root };
    expect(get(child)).toEqual({ n: 0 });
    expect(child.k).toEqual({ n: 0 });
    expect(root.k).toEqual({ n: 99 });
  });

  it("does not return Object.prototype members", () => {
    const [get] = getAdapter<string>("constructor", () => "made");
    expect(get({})).toBe("made");
  });
});
