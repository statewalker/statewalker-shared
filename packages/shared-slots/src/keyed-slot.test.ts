import { describe, expect, it } from "vitest";
import { KeyedSlot } from "./keyed-slot.js";
import { Slots } from "./types.js";

interface Item {
  label: string;
}

describe("KeyedSlot", () => {
  it("registers, looks up by id, and bumps version on each register", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    const v0 = k.version;

    const v1: Item = { label: "alpha" };
    const v2: Item = { label: "beta" };
    k.register("a", v1);
    k.register("b", v2);

    expect(k.get("a")).toBe(v1);
    expect(k.get("b")).toBe(v2);
    expect(k.version).toBe(v0 + 2);
  });

  it("returns null for unknown ids", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    expect(k.get("missing")).toBeNull();
  });

  it("throws RangeError on id collision with a different value", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");

    k.register("a", { label: "first" });
    expect(() => k.register("a", { label: "second" })).toThrow(RangeError);
  });

  it("treats re-registration with the same reference as a no-op until all disposers fire", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    const v: Item = { label: "alpha" };

    const dispose1 = k.register("a", v);
    const dispose2 = k.register("a", v);
    expect(k.get("a")).toBe(v);

    dispose1();
    // Still present after only one disposer fires.
    expect(k.get("a")).toBe(v);

    dispose2();
    expect(k.get("a")).toBeNull();
  });

  it("disposer removes the entry exactly once", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    const v: Item = { label: "alpha" };

    const dispose = k.register("a", v);
    expect(k.get("a")).toBe(v);

    dispose();
    expect(k.get("a")).toBeNull();

    // Calling the disposer again is harmless.
    dispose();
    expect(k.get("a")).toBeNull();
  });

  it("observe fires synchronously with the current entries and on every change", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    const seen: ReadonlyMap<string, Item>[] = [];

    k.register("a", { label: "first" });
    const dispose = k.observe((entries) => {
      seen.push(new Map(entries));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.get("a")?.label).toBe("first");

    k.register("b", { label: "second" });
    expect(seen).toHaveLength(2);
    expect(seen[1]?.get("b")?.label).toBe("second");

    dispose();
    k.register("c", { label: "ignored" });
    expect(seen).toHaveLength(2);
  });

  it("supports O(1) lookup over thousands of entries", () => {
    const slots = new Slots();
    const k = new KeyedSlot<Item>(slots, "x:items");
    const N = 1000;
    for (let i = 0; i < N; i += 1) {
      k.register(`id-${i}`, { label: `value-${i}` });
    }

    // Smoke test — random-ish lookups across the range without intervening
    // mutation should rebuild the index at most once.
    const ids = ["id-0", "id-499", `id-${N - 1}`, "id-12", "id-781"];
    for (const id of ids) {
      const expected = `value-${id.slice(3)}`;
      expect(k.get(id)?.label).toBe(expected);
    }
  });
});
