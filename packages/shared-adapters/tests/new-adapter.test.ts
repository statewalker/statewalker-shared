import { describe, expect, it, vi } from "vitest";
import { newAdapter } from "../src/new-adapter.js";

describe("newAdapter — basic get/set/remove", () => {
  it("set stores the value and get retrieves it", () => {
    const [get, set] = newAdapter<{ n: number }>("k");
    const ctx: Record<string, unknown> = {};
    set(ctx, { n: 42 });
    expect(get(ctx)).toEqual({ n: 42 });
  });

  it("remove deletes the value", () => {
    const [get, set, remove] = newAdapter<number>("k");
    const ctx: Record<string, unknown> = {};
    set(ctx, 1);
    remove(ctx);
    expect(() => get(ctx)).toThrow("Adapter not found: k");
  });

  it("get throws when missing and not optional", () => {
    const [get] = newAdapter<number>("missing");
    expect(() => get({})).toThrow("Adapter not found: missing");
  });

  it("get(optional=true) returns undefined when missing", () => {
    const [get] = newAdapter<number>("missing");
    expect(get({}, true)).toBeUndefined();
  });
});

describe("newAdapter — factory create", () => {
  it("create() lazily produces the value and caches it on the context", () => {
    const factory = vi.fn((): { id: string } => ({ id: "auto" }));
    const [get] = newAdapter<{ id: string }>("auto", factory);
    const ctx: Record<string, unknown> = {};

    const a = get(ctx);
    const b = get(ctx);

    expect(a).toEqual({ id: "auto" });
    expect(b).toBe(a);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("create() receives the context", () => {
    const [get] = newAdapter<{ source: unknown }>("withCtx", (ctx) => ({ source: ctx }));
    const ctx: Record<string, unknown> = { tag: "x" };
    expect(get(ctx).source).toBe(ctx);
  });
});

describe("newAdapter — hierarchical lookup", () => {
  it("walks the default parent chain and inherits from ancestors", () => {
    const [get, set] = newAdapter<string>("h");
    const root: Record<string, unknown> = {};
    const child: Record<string, unknown> = { parent: root };
    const grandchild: Record<string, unknown> = { parent: child };
    set(root, "from-root");
    expect(get(grandchild)).toBe("from-root");
  });

  it("nearest ancestor wins over deeper ones", () => {
    const [get, set] = newAdapter<string>("h");
    const root: Record<string, unknown> = {};
    const child: Record<string, unknown> = { parent: root };
    const grandchild: Record<string, unknown> = { parent: child };
    set(root, "from-root");
    set(child, "from-child");
    expect(get(grandchild)).toBe("from-child");
  });

  it("custom getParent is used instead of the default parent field", () => {
    interface Node {
      up?: Node;
      v?: string;
    }
    const [get, set] = newAdapter<string, Node>("v", undefined, (n) => n.up);
    const root: Node = {};
    const child: Node = { up: root };
    set(root, "ok");
    expect(get(child)).toBe("ok");
  });

  it("create() runs only when no ancestor provides the value", () => {
    const factory = vi.fn(() => "made");
    const [get, set] = newAdapter<string>("h", factory);
    const root: Record<string, unknown> = {};
    const child: Record<string, unknown> = { parent: root };
    set(root, "inherited");
    expect(get(child)).toBe("inherited");
    expect(factory).not.toHaveBeenCalled();
  });

  it("create() stores on the original context, not on the ancestor", () => {
    const [get] = newAdapter<string>("h", () => "made");
    const root: Record<string, unknown> = {};
    const child: Record<string, unknown> = { parent: root };
    get(child);
    expect(child).toHaveProperty("h", "made");
    expect(root).not.toHaveProperty("h");
  });
});
