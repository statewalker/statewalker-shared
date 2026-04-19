import { describe, expect, it, vi } from "vitest";
import { BaseClass } from "./base-class.js";
import { onChange } from "./on-change.js";

describe("onChange", () => {
  it("fires callback only when derived value changes", () => {
    class Model extends BaseClass {
      value = 0;
    }
    const m = new Model();
    const cb = vi.fn();
    onChange(
      (cb) => m.onUpdate(cb),
      cb,
      () => m.value,
    );

    m.notify(); // value unchanged (0 -> 0)
    expect(cb).not.toHaveBeenCalled();

    m.value = 1;
    m.notify(); // value changed (0 -> 1)
    expect(cb).toHaveBeenCalledOnce();
  });

  it("uses strict equality", () => {
    class Model extends BaseClass {
      ref: object = { a: 1 };
    }
    const m = new Model();
    const cb = vi.fn();
    onChange(
      (cb) => m.onUpdate(cb),
      cb,
      () => m.ref,
    );

    m.ref = { a: 1 }; // different reference, same shape
    m.notify();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("returns unsubscribe function", () => {
    class Model extends BaseClass {
      value = 0;
    }
    const m = new Model();
    const cb = vi.fn();
    const unsub = onChange(
      (cb) => m.onUpdate(cb),
      cb,
      () => m.value,
    );

    unsub();
    m.value = 1;
    m.notify();
    expect(cb).not.toHaveBeenCalled();
  });
});
