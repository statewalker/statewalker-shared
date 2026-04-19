import { describe, expect, it, vi } from "vitest";
import { BaseClass } from "./base-class.js";

describe("BaseClass", () => {
  it("should notify listeners on notify()", () => {
    const obj = new BaseClass();
    const listener = vi.fn();
    obj.onUpdate(listener);
    obj.notify();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should support multiple listeners", () => {
    const obj = new BaseClass();
    const l1 = vi.fn();
    const l2 = vi.fn();
    obj.onUpdate(l1);
    obj.onUpdate(l2);
    obj.notify();
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it("should unsubscribe a listener", () => {
    const obj = new BaseClass();
    const listener = vi.fn();
    const unsub = obj.onUpdate(listener);
    unsub();
    obj.notify();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should deduplicate same listener reference", () => {
    const obj = new BaseClass();
    const listener = vi.fn();
    obj.onUpdate(listener);
    obj.onUpdate(listener);
    obj.notify();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("toJSON excludes functions and _-prefixed fields", () => {
    class Model extends BaseClass {
      name = "test";
      count = 42;
      _internal = "hidden";
      doThing() {
        return 1;
      }
    }
    const m = new Model();
    const json = m.toJSON();
    expect(json).toEqual({ name: "test", count: 42 });
    expect(json).not.toHaveProperty("_internal");
    expect(json).not.toHaveProperty("doThing");
  });

  it("fromJSON applies values and notifies on change", () => {
    class Model extends BaseClass {
      name = "old";
      count = 0;
    }
    const m = new Model();
    const listener = vi.fn();
    m.onUpdate(listener);

    m.fromJSON({ name: "new", count: 5 });
    expect(m.name).toBe("new");
    expect(m.count).toBe(5);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("fromJSON does not notify when values are identical", () => {
    class Model extends BaseClass {
      name = "same";
    }
    const m = new Model();
    const listener = vi.fn();
    m.onUpdate(listener);

    m.fromJSON({ name: "same" });
    expect(listener).not.toHaveBeenCalled();
  });
});
