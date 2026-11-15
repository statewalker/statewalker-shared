import { describe, expect, it, vi } from "vitest";
import { BaseClass } from "../src/base-class.js";

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

  describe("fromJSON ignores keys toJSON would not emit (#27)", () => {
    class Model extends BaseClass {
      name = "a";
      _secret = "keep";
    }

    it("ignores __proto__ from parsed JSON and keeps the prototype", () => {
      const m = new Model();
      const listener = vi.fn();
      m.onUpdate(listener);
      expect(() => m.fromJSON(JSON.parse('{"__proto__":{"x":1}}'))).not.toThrow();
      expect(m).toBeInstanceOf(BaseClass);
      expect(m).toBeInstanceOf(Model);
      expect((m as unknown as { x?: unknown }).x).toBeUndefined();
      expect(listener).not.toHaveBeenCalled();
      m.notify();
      expect(listener).toHaveBeenCalledOnce();
    });

    it("ignores constructor and prototype keys", () => {
      const m = new Model();
      m.fromJSON({ constructor: 1, prototype: 2 });
      expect(m.constructor).toBe(Model);
      expect(Object.hasOwn(m, "prototype")).toBe(false);
    });

    it("ignores _-prefixed keys, including _listeners", () => {
      const m = new Model();
      const listener = vi.fn();
      m.onUpdate(listener);
      expect(() => m.fromJSON({ _listeners: null, _secret: "changed" })).not.toThrow();
      expect(m._secret).toBe("keep");
      expect(listener).not.toHaveBeenCalled();
      m.notify();
      expect(listener).toHaveBeenCalledOnce();
    });

    it("ignores keys whose current value is a function", () => {
      class WithMethod extends Model {
        doThing() {
          return 1;
        }
      }
      const m = new WithMethod();
      const onUpdate = m.onUpdate;
      const listener = vi.fn();
      m.onUpdate(listener);
      m.fromJSON({ onUpdate: 5, notify: 6, doThing: 7, toJSON: 8 });
      expect(m.onUpdate).toBe(onUpdate);
      expect(m.doThing()).toBe(1);
      expect(m.toJSON()).toEqual({ name: "a" });
      expect(listener).not.toHaveBeenCalled();
    });

    it("still applies ordinary keys next to ignored ones", () => {
      const m = new Model();
      const listener = vi.fn();
      m.onUpdate(listener);
      m.fromJSON({ name: "b", _secret: "x", onUpdate: 1 });
      expect(m.name).toBe("b");
      expect(m._secret).toBe("keep");
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  it("listeners are deduplicated by reference: one disposer removes the shared entry", () => {
    const obj = new BaseClass();
    const listener = vi.fn();
    const off1 = obj.onUpdate(listener);
    obj.onUpdate(listener);
    off1();
    obj.notify();
    expect(listener).not.toHaveBeenCalled();
  });
});
