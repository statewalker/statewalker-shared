import { describe, expect, it, vi } from "vitest";
import { defineKeyedSlot, defineSlot } from "../src/define-slot.js";
import { Slots } from "../src/types.js";

describe("Slots — plain", () => {
  const k = defineSlot<string>("k");

  it("provide → observe immediate snapshot", () => {
    const slots = new Slots();
    slots.provide(k, "v");
    const cb = vi.fn();
    slots.observe(k, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(["v"]);
  });

  it("notifies live observers on provide", () => {
    const slots = new Slots();
    const cb = vi.fn();
    slots.observe(k, cb);
    cb.mockClear();
    slots.provide(k, "v");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(["v"]);
  });

  it("dispose removes the value and notifies", () => {
    const slots = new Slots();
    const dispose = slots.provide(k, "v");
    const cb = vi.fn();
    slots.observe(k, cb);
    cb.mockClear();
    dispose();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it("reference dedupes", () => {
    interface Item {
      id: string;
    }
    const slot = defineSlot<Item>("k:items");
    const slots = new Slots();
    const v = { id: "a" };
    slots.provide(slot, v);
    slots.provide(slot, v);
    const cb = vi.fn();
    slots.observe(slot, cb);
    expect(cb).toHaveBeenCalledWith([v]);
  });

  it("keeps structurally-equal-but-distinct values separate", () => {
    interface Item {
      id: string;
    }
    const slot = defineSlot<Item>("k:items2");
    const slots = new Slots();
    const a = { id: "a" };
    const b = { id: "a" };
    slots.provide(slot, a);
    slots.provide(slot, b);
    const cb = vi.fn();
    slots.observe(slot, cb);
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
      slots.observe(k, a);
      slots.observe(k, b);
      a.mockClear();
      b.mockClear();
      slots.provide(k, "v");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledWith(["v"]);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("getSnapshot returns the same reference without mutations", () => {
    const slots = new Slots();
    slots.provide(k, "v");
    const a = slots.getSnapshot(k);
    const b = slots.getSnapshot(k);
    expect(a).toBe(b);
  });

  it("getSnapshot reference invalidates on provide", () => {
    const slots = new Slots();
    slots.provide(k, "v1");
    const before = slots.getSnapshot(k);
    slots.provide(k, "v2");
    const after = slots.getSnapshot(k);
    expect(after).not.toBe(before);
    expect(after).toEqual(["v1", "v2"]);
  });

  it("getSnapshot reference invalidates on dispose", () => {
    const slots = new Slots();
    const dispose = slots.provide(k, "v");
    const before = slots.getSnapshot(k);
    dispose();
    const after = slots.getSnapshot(k);
    expect(after).not.toBe(before);
    expect(after).toEqual([]);
  });

  it("getSnapshot returns empty for unknown keys (stable empty)", () => {
    const slots = new Slots();
    const missing = defineSlot<string>("missing");
    const a = slots.getSnapshot(missing);
    const b = slots.getSnapshot(missing);
    expect(a).toBe(b);
    expect(a).toEqual([]);
  });

  it("workspaces have separate buses (instance isolation)", () => {
    const ws1 = new Slots();
    const ws2 = new Slots();
    ws1.provide(k, "v");
    expect(ws2.getSnapshot(k)).toEqual([]);
    expect(ws1.getSnapshot(k)).toEqual(["v"]);
  });

  it("observer dispose stops further notifications", () => {
    const slots = new Slots();
    const cb = vi.fn();
    const dispose = slots.observe(k, cb);
    cb.mockClear();
    dispose();
    slots.provide(k, "v");
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not invalidate snapshot when provide is reference-deduped", () => {
    interface Item {
      id: string;
    }
    const slot = defineSlot<Item>("k:dedup-snap");
    const slots = new Slots();
    const v = { id: "a" };
    slots.provide(slot, v);
    const before = slots.getSnapshot(slot);
    slots.provide(slot, v); // no-op
    const after = slots.getSnapshot(slot);
    expect(after).toBe(before);
  });
});

describe("defineSlot", () => {
  it("returns a frozen declaration with the key and plain brand", () => {
    const decl = defineSlot<{ id: string }>("hidden-key");
    expect(decl.key).toBe("hidden-key");
    expect(decl._kind).toBe("plain");
    expect(Object.isFrozen(decl)).toBe(true);
  });
});

describe("Slots — keyed", () => {
  interface Item {
    label: string;
  }
  const items = defineKeyedSlot<Item>("x:items");

  it("registers, looks up by id, observes immediate snapshot", () => {
    const slots = new Slots();
    const v1: Item = { label: "alpha" };
    const v2: Item = { label: "beta" };
    slots.register(items, "a", v1);
    slots.register(items, "b", v2);

    expect(slots.get(items, "a")).toBe(v1);
    expect(slots.get(items, "b")).toBe(v2);

    const cb = vi.fn();
    slots.observe(items, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const seen = cb.mock.calls[0]?.[0] as ReadonlyMap<string, Item>;
    expect(seen.get("a")).toBe(v1);
    expect(seen.get("b")).toBe(v2);
  });

  it("returns null for unknown ids", () => {
    const slots = new Slots();
    expect(slots.get(items, "missing")).toBeNull();
  });

  it("throws RangeError on id collision with a different value", () => {
    const slots = new Slots();
    slots.register(items, "a", { label: "first" });
    expect(() => slots.register(items, "a", { label: "second" })).toThrow(RangeError);
  });

  it("treats re-registration with the same reference as ref-counted no-op", () => {
    const slots = new Slots();
    const v: Item = { label: "alpha" };

    const dispose1 = slots.register(items, "a", v);
    const dispose2 = slots.register(items, "a", v);
    expect(slots.get(items, "a")).toBe(v);

    dispose1();
    // Still present after only one disposer fires.
    expect(slots.get(items, "a")).toBe(v);

    dispose2();
    // Now actually removed.
    expect(slots.get(items, "a")).toBeNull();
  });

  it("observe notifies on every register / dispose with a fresh ReadonlyMap", () => {
    const slots = new Slots();
    const cb = vi.fn();
    slots.observe(items, cb);
    cb.mockClear();

    const v1: Item = { label: "a" };
    slots.register(items, "a", v1);
    expect(cb).toHaveBeenCalledTimes(1);

    const v2: Item = { label: "b" };
    const dispose = slots.register(items, "b", v2);
    expect(cb).toHaveBeenCalledTimes(2);

    dispose();
    expect(cb).toHaveBeenCalledTimes(3);
    const last = cb.mock.calls[2]?.[0] as ReadonlyMap<string, Item>;
    expect(last.has("b")).toBe(false);
    expect(last.get("a")).toBe(v1);
  });

  it("plain and keyed slots with the same key string are independent", () => {
    const slots = new Slots();
    const plain = defineSlot<string>("shared-key");
    const keyed = defineKeyedSlot<string>("shared-key");

    slots.provide(plain, "p1");
    slots.register(keyed, "id1", "k1");

    expect(slots.getSnapshot(plain)).toEqual(["p1"]);
    expect(slots.get(keyed, "id1")).toBe("k1");
  });

  it("observer dispose stops further keyed notifications", () => {
    const slots = new Slots();
    const cb = vi.fn();
    const dispose = slots.observe(items, cb);
    cb.mockClear();
    dispose();
    slots.register(items, "a", { label: "x" });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("defineKeyedSlot", () => {
  it("returns a frozen declaration with the key and keyed brand", () => {
    const decl = defineKeyedSlot<number>("k:nums");
    expect(decl.key).toBe("k:nums");
    expect(decl._kind).toBe("keyed");
    expect(Object.isFrozen(decl)).toBe(true);
  });
});

describe("Slots — disposer idempotence (#21)", () => {
  interface Item {
    label: string;
  }
  const plain = defineSlot<Item>("idem:plain");
  const keyed = defineKeyedSlot<Item>("idem:keyed");

  it("plain: a stale disposer does not remove a later provide of the same value", () => {
    const slots = new Slots();
    const v: Item = { label: "v" };
    const p1 = slots.provide(plain, v);
    p1();
    slots.provide(plain, v);
    p1();
    expect(slots.getSnapshot(plain)).toEqual([v]);
  });

  it("plain: calling a disposer twice notifies once", () => {
    const slots = new Slots();
    const v: Item = { label: "v" };
    const p1 = slots.provide(plain, v);
    const cb = vi.fn();
    slots.observe(plain, cb);
    cb.mockClear();
    p1();
    p1();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("plain: a deduped disposer from an earlier provide cycle is a no-op", () => {
    const slots = new Slots();
    const v: Item = { label: "v" };
    const p1 = slots.provide(plain, v);
    const p2 = slots.provide(plain, v); // deduped
    p1(); // removes v (plain slots are not ref-counted)
    slots.provide(plain, v); // a fresh contribution
    p2(); // belongs to the earlier contribution
    expect(slots.getSnapshot(plain)).toEqual([v]);
  });

  it("keyed: a stale disposer does not remove a later registration under the same id", () => {
    const slots = new Slots();
    const a: Item = { label: "A" };
    const b: Item = { label: "B" };
    const dA = slots.register(keyed, "id", a);
    dA();
    slots.register(keyed, "id", b);
    dA();
    expect(slots.get(keyed, "id")).toBe(b);
  });

  it("keyed: a stale disposer does not remove a later registration of the same value", () => {
    const slots = new Slots();
    const a: Item = { label: "A" };
    const dA = slots.register(keyed, "id", a);
    dA();
    slots.register(keyed, "id", a);
    dA();
    expect(slots.get(keyed, "id")).toBe(a);
  });

  it("keyed: calling one disposer twice does not release another registration", () => {
    const slots = new Slots();
    const v: Item = { label: "v" };
    const d1 = slots.register(keyed, "id", v);
    const d2 = slots.register(keyed, "id", v);
    d1();
    d1();
    expect(slots.get(keyed, "id")).toBe(v);
    d2();
    expect(slots.get(keyed, "id")).toBeNull();
  });
});

describe("Slots — observer robustness (#33)", () => {
  interface Item {
    label: string;
  }
  const plain = defineSlot<Item>("obs:plain");
  const keyed = defineKeyedSlot<Item>("obs:keyed");

  it("keyed snapshot cannot be mutated through a cast", () => {
    const slots = new Slots();
    const v: Item = { label: "v" };
    slots.register(keyed, "a", v);
    const snap = slots.getSnapshot(keyed) as unknown as Map<string, Item>;
    expect(() => snap.set("evil", { label: "evil" })).toThrow();
    expect(() => snap.delete("a")).toThrow();
    expect(() => snap.clear()).toThrow();
    expect(slots.getSnapshot(keyed).has("evil")).toBe(false);
    expect(slots.getSnapshot(keyed).get("a")).toBe(v);
  });

  it("keyed snapshot behaves as a ReadonlyMap", () => {
    const slots = new Slots();
    const a: Item = { label: "a" };
    const b: Item = { label: "b" };
    slots.register(keyed, "a", a);
    slots.register(keyed, "b", b);
    const snap = slots.getSnapshot(keyed);
    expect(snap.size).toBe(2);
    expect(snap.has("a")).toBe(true);
    expect([...snap]).toEqual([
      ["a", a],
      ["b", b],
    ]);
    expect([...snap.keys()]).toEqual(["a", "b"]);
    expect([...snap.values()]).toEqual([a, b]);
    expect([...snap.entries()]).toEqual([
      ["a", a],
      ["b", b],
    ]);
    const seen: string[] = [];
    snap.forEach((value, id, map) => {
      expect(map).toBe(snap);
      seen.push(`${id}=${value.label}`);
    });
    expect(seen).toEqual(["a=a", "b=b"]);
  });

  it("plain: an observer added during a notification is not called twice in that pass", () => {
    const slots = new Slots();
    const late = vi.fn();
    let armed = false;
    slots.observe(plain, () => {
      if (!armed) return;
      armed = false;
      slots.observe(plain, late);
    });
    armed = true;
    slots.provide(plain, { label: "v" });
    // Called once by its own immediate snapshot, not again by the ongoing pass.
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("keyed: an observer added during a notification is not called twice in that pass", () => {
    const slots = new Slots();
    const late = vi.fn();
    let armed = false;
    slots.observe(keyed, () => {
      if (!armed) return;
      armed = false;
      slots.observe(keyed, late);
    });
    armed = true;
    slots.register(keyed, "a", { label: "v" });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("an observer removed during a notification is not called later in that pass", () => {
    const slots = new Slots();
    const second = vi.fn();
    let off: () => void = () => {};
    slots.observe(plain, () => off());
    off = slots.observe(plain, second);
    second.mockClear();
    slots.provide(plain, { label: "v" });
    expect(second).not.toHaveBeenCalled();
  });

  it("plain observers receive the frozen cached snapshot", () => {
    const slots = new Slots();
    const seen: (readonly Item[])[] = [];
    slots.observe(plain, (values) => seen.push(values));
    slots.provide(plain, { label: "v" });
    expect(seen).toHaveLength(2);
    for (const values of seen) expect(Object.isFrozen(values)).toBe(true);
    expect(seen[1]).toBe(slots.getSnapshot(plain));
  });

  it("all plain observers of one pass see the same unmodifiable array", () => {
    const slots = new Slots();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const a: Item = { label: "a" };
      const b: Item = { label: "b" };
      slots.provide(plain, b);
      const received: (readonly Item[])[] = [];
      slots.observe(plain, (values) => {
        (values as Item[]).sort((x, y) => x.label.localeCompare(y.label));
      });
      slots.observe(plain, (values) => received.push(values));
      received.length = 0;
      slots.provide(plain, a);
      expect(received[0]).toEqual([b, a]);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("keyed observers receive the cached snapshot", () => {
    const slots = new Slots();
    const seen: ReadonlyMap<string, Item>[] = [];
    slots.observe(keyed, (entries) => seen.push(entries));
    slots.register(keyed, "a", { label: "v" });
    expect(seen[1]).toBe(slots.getSnapshot(keyed));
  });

  it("observing the same callback twice keeps one subscription per call", () => {
    const slots = new Slots();
    const cb = vi.fn();
    const off1 = slots.observe(plain, cb);
    slots.observe(plain, cb);
    off1();
    cb.mockClear();
    slots.provide(plain, { label: "v" });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("keyed: observing the same callback twice keeps one subscription per call", () => {
    const slots = new Slots();
    const cb = vi.fn();
    const off1 = slots.observe(keyed, cb);
    const off2 = slots.observe(keyed, cb);
    off1();
    off1();
    cb.mockClear();
    slots.register(keyed, "a", { label: "v" });
    expect(cb).toHaveBeenCalledTimes(1);
    off2();
    cb.mockClear();
    slots.register(keyed, "b", { label: "w" });
    expect(cb).not.toHaveBeenCalled();
  });
});
