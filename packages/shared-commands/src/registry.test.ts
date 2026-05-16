import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Command } from "./command.js";
import { CommandsRegistry } from "./registry.js";

const A = Command.required("a").input(z.object({})).output(z.object({})).build();
const B = Command.required("b").input(z.object({})).output(z.object({})).build();
const C = Command.required("c").input(z.object({})).output(z.object({})).build();
const D = Command.required("d").input(z.object({})).output(z.object({})).build();
const BConflict = Command.required("b").input(z.object({})).output(z.object({})).build();

describe("CommandsRegistry — mutable", () => {
  it("create(A, B, C) seeds with three entries", () => {
    const r = CommandsRegistry.create(A, B, C);
    expect(r.list()).toHaveLength(3);
    expect(r.get("a")).toBe(A);
    expect(r.get("b")).toBe(B);
    expect(r.get("c")).toBe(C);
  });

  it(".set(D) adds and fires onUpdate once", () => {
    const r = CommandsRegistry.create(A);
    const cb = vi.fn();
    r.onUpdate(cb);
    r.set(D);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(r.get("d")).toBe(D);
  });

  it(".set(A) with same reference is idempotent (no fire)", () => {
    const r = CommandsRegistry.create(A);
    const cb = vi.fn();
    r.onUpdate(cb);
    r.set(A);
    expect(cb).not.toHaveBeenCalled();
  });

  it(".set(B_conflict) with different ref throws and leaves contents unchanged", () => {
    const r = CommandsRegistry.create(B);
    const cb = vi.fn();
    r.onUpdate(cb);
    expect(() => r.set(BConflict)).toThrow(RangeError);
    expect(r.get("b")).toBe(B);
    expect(cb).not.toHaveBeenCalled();
  });

  it("variadic .set(C, D, B_conflict) is atomic", () => {
    const r = CommandsRegistry.create(A, B);
    const cb = vi.fn();
    r.onUpdate(cb);
    expect(() => r.set(C, D, BConflict)).toThrow(RangeError);
    expect(r.get("c")).toBeUndefined();
    expect(r.get("d")).toBeUndefined();
    expect(cb).not.toHaveBeenCalled();
  });

  it('.remove("missing") is a no-op', () => {
    const r = CommandsRegistry.create(A);
    const cb = vi.fn();
    r.onUpdate(cb);
    r.remove("never-registered");
    expect(cb).not.toHaveBeenCalled();
  });

  it("chained .set(...).remove(...) returns this", () => {
    const r = CommandsRegistry.create();
    const same = r.set(A, B).remove("a").set(C);
    expect(same).toBe(r);
    expect(
      r
        .list()
        .map((d) => d.key)
        .sort(),
    ).toEqual(["b", "c"]);
  });

  it("disposer stops onUpdate notifications", () => {
    const r = CommandsRegistry.create(A);
    const cb = vi.fn();
    const dispose = r.onUpdate(cb);
    dispose();
    r.set(B);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("CommandsRegistry — compose", () => {
  it("list concatenates", () => {
    const a = CommandsRegistry.create(A);
    const b = CommandsRegistry.create(B, C);
    const composed = CommandsRegistry.compose(a, b);
    expect(composed.list()).toHaveLength(3);
  });

  it("get is first-match-wins on key collision", () => {
    const a = CommandsRegistry.create(B);
    const b = CommandsRegistry.create(BConflict);
    const composed = CommandsRegistry.compose(a, b);
    expect(composed.get("b")).toBe(B);
  });

  it("onUpdate fans out from any source", () => {
    const a = CommandsRegistry.create();
    const b = CommandsRegistry.create();
    const composed = CommandsRegistry.compose(a, b);
    const cb = vi.fn();
    composed.onUpdate(cb);
    a.set(A);
    b.set(B);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("disposer unsubscribes from every source", () => {
    const a = CommandsRegistry.create();
    const b = CommandsRegistry.create();
    const composed = CommandsRegistry.compose(a, b);
    const cb = vi.fn();
    const dispose = composed.onUpdate(cb);
    dispose();
    a.set(A);
    b.set(B);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("CommandsRegistry — filter", () => {
  it("list/get respect the predicate", () => {
    const source = CommandsRegistry.create(A, B, C);
    const filtered = CommandsRegistry.filter(source, (d) => d.key === "a" || d.key === "b");
    expect(filtered.list()).toHaveLength(2);
    expect(filtered.get("a")).toBe(A);
    expect(filtered.get("c")).toBeUndefined();
  });

  it("source updates forward to subscribers unconditionally", () => {
    const source = CommandsRegistry.create();
    const filtered = CommandsRegistry.filter(source, () => true);
    const cb = vi.fn();
    filtered.onUpdate(cb);
    source.set(A);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("CommandsRegistry — namespace", () => {
  it("keys are prefix-wrapped in list and lookup", () => {
    const source = CommandsRegistry.create(A);
    const ns = CommandsRegistry.namespace(source, "mcp:");
    const list = ns.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.key).toBe("mcp:a");
    expect(ns.get("mcp:a")?.key).toBe("mcp:a");
  });

  it("original policy/inputSchema/outputSchema preserved on wrapper", () => {
    const source = CommandsRegistry.create(A);
    const ns = CommandsRegistry.namespace(source, "x:");
    const wrapper = ns.get("x:a");
    expect(wrapper?.policy).toBe(A.policy);
    expect(wrapper?.inputSchema).toBe(A.inputSchema);
    expect(wrapper?.outputSchema).toBe(A.outputSchema);
  });

  it("get returns undefined for keys missing the prefix", () => {
    const source = CommandsRegistry.create(A);
    const ns = CommandsRegistry.namespace(source, "x:");
    expect(ns.get("a")).toBeUndefined();
    expect(ns.get("y:a")).toBeUndefined();
  });
});
