import { describe, expect, it, vi } from "vitest";
import { BaseClass } from "../src/base-class.js";

// BaseClass builds on the shared Notifier (#41): same public API, the
// shared notification rules.
describe("BaseClass notification rules", () => {
  it("a stale disposer does not remove a later registration of the same listener", () => {
    const obj = new BaseClass();
    const listener = vi.fn();
    const off = obj.onUpdate(listener);
    off();
    obj.onUpdate(listener);
    off();
    obj.notify();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("a listener added during notify() is not called by that pass", () => {
    const obj = new BaseClass();
    const late = vi.fn();
    obj.onUpdate(() => {
      obj.onUpdate(late);
    });
    obj.notify();
    expect(late).not.toHaveBeenCalled();
    obj.notify();
    expect(late).toHaveBeenCalledOnce();
  });

  it("a listener removed during notify() is not called by that pass", () => {
    const obj = new BaseClass();
    const second = vi.fn();
    let off = () => {};
    obj.onUpdate(() => off());
    off = obj.onUpdate(second);
    obj.notify();
    expect(second).not.toHaveBeenCalled();
  });

  it("a throwing listener does not stop the others; notify() rethrows its error after the pass", () => {
    const obj = new BaseClass();
    const after = vi.fn();
    const boom = new Error("boom");
    obj.onUpdate(() => {
      throw boom;
    });
    obj.onUpdate(after);
    expect(() => obj.notify()).toThrow(boom);
    expect(after).toHaveBeenCalledOnce();
  });

  it("keeps listener state out of toJSON", () => {
    class Model extends BaseClass {
      name = "m";
    }
    const m = new Model();
    m.onUpdate(() => {});
    expect(m.toJSON()).toEqual({ name: "m" });
  });
});
