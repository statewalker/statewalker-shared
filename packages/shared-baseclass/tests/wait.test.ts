import { describe, expect, it, vi } from "vitest";
import { BaseClass } from "../src/base-class.js";
import { waitFor, waitForValue } from "../src/wait.js";

describe("waitForValue", () => {
  it("resolves immediately when the value is already present", async () => {
    class Model extends BaseClass {
      v: number | undefined = 7;
    }
    const m = new Model();
    expect(await waitForValue(m.onUpdate, () => m.v)).toBe(7);
  });

  it("resolves after notify when the value appears", async () => {
    class Model extends BaseClass {
      v: string | undefined = undefined;
    }
    const m = new Model();
    const p = waitForValue(m.onUpdate, () => m.v);
    m.v = "ready";
    m.notify();
    expect(await p).toBe("ready");
  });

  it("ignores notifications while the value is still undefined", async () => {
    class Model extends BaseClass {
      v: string | undefined = undefined;
    }
    const m = new Model();
    const get = vi.fn(() => m.v);
    const p = waitForValue(m.onUpdate, get);
    m.notify();
    m.notify();
    m.v = "ok";
    m.notify();
    expect(await p).toBe("ok");
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("waitFor", () => {
  it("resolves immediately when the check already holds", async () => {
    const m = new BaseClass();
    await waitFor(m.onUpdate, () => true);
  });

  it("resolves after notify once the check holds", async () => {
    class Model extends BaseClass {
      done = false;
    }
    const m = new Model();
    const p = waitFor(m.onUpdate, () => m.done);
    m.done = true;
    m.notify();
    await p;
  });

  it("unsubscribes after resolving", async () => {
    class Model extends BaseClass {
      done = false;
    }
    const m = new Model();
    const check = vi.fn(() => m.done);
    const p = waitFor(m.onUpdate, check);
    m.done = true;
    m.notify();
    await p;
    const callsAfter = check.mock.calls.length;
    m.notify();
    expect(check.mock.calls.length).toBe(callsAfter);
  });
});
