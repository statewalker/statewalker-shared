import { describe, expect, it } from "vitest";
import { BaseClass } from "../src/base-class.js";
import { readValues } from "../src/read-values.js";

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
});
