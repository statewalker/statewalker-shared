import { describe, expect, it, vi } from "vitest";
import { newSlot } from "./new-slot.js";
import { Slots } from "./types.js";

describe("Slots", () => {
  it("provide → observe immediate snapshot", () => {
    const slots = new Slots();
    slots.provide("k", "v");
    const cb = vi.fn();
    slots.observe("k", cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(["v"]);
  });

  it("notifies live observers on provide", () => {
    const slots = new Slots();
    const cb = vi.fn();
    slots.observe("k", cb);
    cb.mockClear();
    slots.provide("k", "v");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(["v"]);
  });

  it("dispose removes the value and notifies", () => {
    const slots = new Slots();
    const dispose = slots.provide("k", "v");
    const cb = vi.fn();
    slots.observe("k", cb);
    cb.mockClear();
    dispose();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it("reference dedupes", () => {
    const slots = new Slots();
    const v = { id: "a" };
    slots.provide("k", v);
    slots.provide("k", v);
    const cb = vi.fn();
    slots.observe("k", cb);
    expect(cb).toHaveBeenCalledWith([v]);
  });

  it("keeps structurally-equal-but-distinct values separate", () => {
    const slots = new Slots();
    const a = { id: "a" };
    const b = { id: "a" };
    slots.provide("k", a);
    slots.provide("k", b);
    const cb = vi.fn();
    slots.observe("k", cb);
    expect(cb).toHaveBeenCalledWith([a, b]);
  });

  it("observer error does not break the chain", () => {
    const slots = new Slots();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const a = vi.fn(() => {
        throw new Error("a-fail");
      });
      const b = vi.fn();
      slots.observe("k", a);
      slots.observe("k", b);
      a.mockClear();
      b.mockClear();
      slots.provide("k", "v");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledWith(["v"]);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("getSnapshot returns the same reference without mutations", () => {
    const slots = new Slots();
    slots.provide("k", "v");
    const a = slots.getSnapshot("k");
    const b = slots.getSnapshot("k");
    expect(a).toBe(b);
  });

  it("getSnapshot reference invalidates on provide", () => {
    const slots = new Slots();
    slots.provide("k", "v1");
    const before = slots.getSnapshot<string>("k");
    slots.provide("k", "v2");
    const after = slots.getSnapshot<string>("k");
    expect(after).not.toBe(before);
    expect(after).toEqual(["v1", "v2"]);
  });

  it("getSnapshot reference invalidates on dispose", () => {
    const slots = new Slots();
    const dispose = slots.provide("k", "v");
    const before = slots.getSnapshot("k");
    dispose();
    const after = slots.getSnapshot("k");
    expect(after).not.toBe(before);
    expect(after).toEqual([]);
  });

  it("getSnapshot returns empty for unknown keys (stable empty)", () => {
    const slots = new Slots();
    const a = slots.getSnapshot("missing");
    const b = slots.getSnapshot("missing");
    expect(a).toBe(b);
    expect(a).toEqual([]);
  });

  it("workspaces have separate buses (instance isolation)", () => {
    const ws1 = new Slots();
    const ws2 = new Slots();
    ws1.provide("k", "v");
    expect(ws2.getSnapshot("k")).toEqual([]);
    expect(ws1.getSnapshot("k")).toEqual(["v"]);
  });

  it("observer dispose stops further notifications", () => {
    const slots = new Slots();
    const cb = vi.fn();
    const dispose = slots.observe("k", cb);
    cb.mockClear();
    dispose();
    slots.provide("k", "v");
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not invalidate snapshot when provide is reference-deduped", () => {
    const slots = new Slots();
    const v = { id: "a" };
    slots.provide("k", v);
    const before = slots.getSnapshot("k");
    slots.provide("k", v); // no-op
    const after = slots.getSnapshot("k");
    expect(after).toBe(before);
  });
});

describe("newSlot", () => {
  it("returns a [provide, observe] tuple of typed functions", () => {
    const slots = new Slots();
    const [provideThing, observeThing] = newSlot<{ id: string }>("k:thing");
    const thing = { id: "x" };
    const cb = vi.fn();
    observeThing(slots, cb);
    cb.mockClear();
    const dispose = provideThing(slots, thing);
    expect(cb).toHaveBeenCalledWith([thing]);
    dispose();
    expect(cb).toHaveBeenLastCalledWith([]);
  });

  it("erases the bare key from the consumer surface", () => {
    const [provide, observe] = newSlot<string>("hidden-key");
    expect(typeof provide).toBe("function");
    expect(typeof observe).toBe("function");
  });
});
