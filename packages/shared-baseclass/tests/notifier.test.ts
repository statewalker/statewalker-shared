import { describe, expect, it, vi } from "vitest";
import { Notifier } from "../src/notifier.js";

// The notification contract (#41) shared by BaseClass, the commands
// registry and Slots.

describe("Notifier", () => {
  it("calls every listener with the same value, in subscription order", () => {
    const n = new Notifier<{ v: number }>();
    const seen: [string, unknown][] = [];
    n.add((x) => seen.push(["a", x]));
    n.add((x) => seen.push(["b", x]));
    const value = { v: 1 };
    n.notify(value);
    expect(seen).toEqual([
      ["a", value],
      ["b", value],
    ]);
    expect(seen[0]?.[1]).toBe(seen[1]?.[1]);
  });

  it("iterates a copy: a listener added during a pass is called from the next one", () => {
    const n = new Notifier();
    const late = vi.fn();
    n.add(() => {
      n.add(late);
    });
    n.notify();
    expect(late).not.toHaveBeenCalled();
    n.notify();
    expect(late).toHaveBeenCalledOnce();
  });

  it("a listener removed during a pass is not called by it", () => {
    const n = new Notifier();
    const second = vi.fn();
    let disposeSecond = () => {};
    n.add(() => disposeSecond());
    disposeSecond = n.add(second);
    n.notify();
    expect(second).not.toHaveBeenCalled();
  });

  it("disposers are idempotent and never remove a later subscription", () => {
    const n = new Notifier();
    const fn = vi.fn();
    const first = n.add(fn);
    first();
    n.add(fn);
    first();
    n.notify();
    expect(fn).toHaveBeenCalledOnce();
    expect(n.size).toBe(1);
  });

  it("without dedupe, each add is an independent subscription", () => {
    const n = new Notifier();
    const fn = vi.fn();
    const d1 = n.add(fn);
    n.add(fn);
    n.notify();
    expect(fn).toHaveBeenCalledTimes(2);
    d1();
    n.notify();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("with dedupe, the same function is subscribed once and either disposer removes it", () => {
    const n = new Notifier({ dedupe: true });
    const fn = vi.fn();
    const d1 = n.add(fn);
    const d2 = n.add(fn);
    n.notify();
    expect(fn).toHaveBeenCalledOnce();
    d2();
    n.notify();
    expect(fn).toHaveBeenCalledOnce();
    expect(n.size).toBe(0);
    // A stale disposer does not remove a later subscription of the same function.
    n.add(fn);
    d1();
    n.notify();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe("error isolation", () => {
    it("every listener runs; a single error is rethrown after the pass", () => {
      const n = new Notifier();
      const after = vi.fn();
      const boom = new Error("boom");
      n.add(() => {
        throw boom;
      });
      n.add(after);
      expect(() => n.notify()).toThrow(boom);
      expect(after).toHaveBeenCalledOnce();
    });

    it("several errors are rethrown together as an AggregateError", () => {
      const n = new Notifier();
      const e1 = new Error("one");
      const e2 = new Error("two");
      n.add(() => {
        throw e1;
      });
      n.add(() => {
        throw e2;
      });
      let caught: unknown;
      try {
        n.notify();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([e1, e2]);
    });

    it("with onError, errors are reported one by one and notify does not throw", () => {
      const errors: unknown[] = [];
      const n = new Notifier({ onError: (e) => errors.push(e) });
      const after = vi.fn();
      const boom = new Error("boom");
      n.add(() => {
        throw boom;
      });
      n.add(after);
      expect(() => n.notify()).not.toThrow();
      expect(errors).toEqual([boom]);
      expect(after).toHaveBeenCalledOnce();
    });
  });

  it("size counts live subscriptions", () => {
    const n = new Notifier();
    expect(n.size).toBe(0);
    const d = n.add(() => {});
    n.add(() => {});
    expect(n.size).toBe(2);
    d();
    d();
    expect(n.size).toBe(1);
  });
});
