import { describe, expect, it } from "vitest";
import { BaseClass } from "../src/base-class.js";
import { readValues } from "../src/read-values.js";

// The package compiles against ESNext only (no DOM / Node typings).
const host = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
const settle = () => new Promise<void>((r) => host.setTimeout(r, 5));

describe("readValues", () => {
  it("yields each newly produced value after notify", async () => {
    class Box extends BaseClass {
      v: number | undefined = 0;
    }
    const box = new Box();

    const iter = readValues(box.onUpdate, () => {
      const v = box.v;
      box.v = undefined;
      return v;
    });

    const first = await iter.next();
    expect(first.value).toBe(0);

    void Promise.resolve().then(() => {
      box.v = 1;
      box.notify();
    });
    const second = await iter.next();
    expect(second.value).toBe(1);

    await iter.return?.(undefined);
  });

  it("blocks while read() returns undefined and resumes on next notify", async () => {
    class Box extends BaseClass {
      v: string | undefined = undefined;
    }
    const box = new Box();

    const iter = readValues(box.onUpdate, () => {
      const v = box.v;
      box.v = undefined;
      return v;
    });

    void Promise.resolve().then(() => {
      box.v = "x";
      box.notify();
    });
    const r = await iter.next();
    expect(r.value).toBe("x");

    await iter.return?.(undefined);
  });

  it("calls cleanup when the generator is closed", async () => {
    let cleaned = false;
    class Box extends BaseClass {
      v: number | undefined = 1;
    }
    const box = new Box();
    const onUpdate = (cb: () => void) => {
      const unsub = box.onUpdate(cb);
      return () => {
        cleaned = true;
        unsub();
      };
    };

    const iter = readValues(onUpdate, () => {
      const v = box.v;
      box.v = undefined;
      return v;
    });
    await iter.next();
    await iter.return?.(undefined);
    expect(cleaned).toBe(true);
  });

  it("calls read only when the consumer asks for the next value (built on newAsyncGenerator, #41)", async () => {
    const box = new BaseClass();
    let reads = 0;
    const iter = readValues(box.onUpdate, () => ++reads);
    expect(reads).toBe(0);
    expect((await iter.next()).value).toBe(1);
    await settle();
    expect(reads).toBe(1);
    box.notify();
    await settle();
    expect(reads).toBe(1);
    expect((await iter.next()).value).toBe(2);
    await iter.return(undefined);
    box.notify();
    await settle();
    expect(reads).toBe(2);
  });

  describe("return() while the consumer waits for a value (#34)", () => {
    function setup() {
      class Box extends BaseClass {
        v: number | undefined = undefined;
      }
      const box = new Box();
      let cleaned = false;
      const onUpdate = (cb: () => void) => {
        const unsub = box.onUpdate(cb);
        return () => {
          cleaned = true;
          unsub();
        };
      };
      const iter = readValues(onUpdate, () => {
        const v = box.v;
        box.v = undefined;
        return v;
      });
      return { box, iter, isCleaned: () => cleaned };
    }

    it("ends the pending next() and unsubscribes", async () => {
      const { iter, isCleaned } = setup();
      const pending = iter.next();
      await Promise.resolve();
      const ret = await iter.return(undefined);
      expect(ret.done).toBe(true);
      expect((await pending).done).toBe(true);
      expect(isCleaned()).toBe(true);
      expect((await iter.next()).done).toBe(true);
    });

    it("does not read or yield values notified after return()", async () => {
      const { box, iter } = setup();
      const pending = iter.next();
      await Promise.resolve();
      const ret = iter.return(undefined);
      box.v = 5;
      box.notify();
      expect((await pending).done).toBe(true);
      expect((await ret).done).toBe(true);
      expect(box.v).toBe(5);
    });

    it("throw() while waiting rejects and unsubscribes", async () => {
      const { iter, isCleaned } = setup();
      const pending = iter.next();
      await Promise.resolve();
      await expect(iter.throw(new Error("stop"))).rejects.toThrow("stop");
      expect((await pending).done).toBe(true);
      expect(isCleaned()).toBe(true);
    });

    it("return() before the first next() never subscribes", async () => {
      const { iter, isCleaned } = setup();
      expect((await iter.return(undefined)).done).toBe(true);
      expect(isCleaned()).toBe(false);
    });
  });
});
