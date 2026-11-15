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

/** An onUpdate that calls the callback synchronously on subscribe, like many stores do. */
function emitOnSubscribe(m: BaseClass) {
  const unsub = vi.fn();
  const onUpdate = (cb: () => void) => {
    const off = m.onUpdate(cb);
    cb();
    return () => {
      unsub();
      off();
    };
  };
  return { onUpdate, unsub };
}

describe("waitFor edge cases (#35)", () => {
  it("resolves when the source emits synchronously on subscribe", async () => {
    const m = new BaseClass();
    const { onUpdate, unsub } = emitOnSubscribe(m);
    let calls = 0;
    await waitFor(onUpdate, () => ++calls > 1);
    expect(unsub).toHaveBeenCalledOnce();
  });

  it("stays subscribed when the emit on subscribe does not satisfy the check", async () => {
    class Model extends BaseClass {
      done = false;
    }
    const m = new Model();
    const { onUpdate, unsub } = emitOnSubscribe(m);
    const p = waitFor(onUpdate, () => m.done);
    expect(unsub).not.toHaveBeenCalled();
    m.done = true;
    m.notify();
    await p;
    expect(unsub).toHaveBeenCalledOnce();
  });

  it("rejects and unsubscribes when check throws inside the listener", async () => {
    class Model extends BaseClass {
      fail = false;
    }
    const m = new Model();
    const check = vi.fn(() => {
      if (m.fail) throw new Error("boom");
      return false;
    });
    const p = waitFor(m.onUpdate, check);
    m.fail = true;
    expect(() => m.notify()).not.toThrow();
    await expect(p).rejects.toThrow("boom");
    const calls = check.mock.calls.length;
    m.notify();
    expect(check.mock.calls.length).toBe(calls);
  });

  it("returns a rejected promise when the initial check throws", async () => {
    const m = new BaseClass();
    const onUpdate = vi.fn(m.onUpdate);
    let p: Promise<void> | undefined;
    expect(() => {
      p = waitFor(onUpdate, () => {
        throw new Error("initial");
      });
    }).not.toThrow();
    await expect(p).rejects.toThrow("initial");
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("waitForValue edge cases (#35)", () => {
  it("resolves when the source emits synchronously on subscribe", async () => {
    const m = new BaseClass();
    const { onUpdate, unsub } = emitOnSubscribe(m);
    let calls = 0;
    expect(await waitForValue(onUpdate, () => (++calls > 1 ? "v" : undefined))).toBe("v");
    expect(unsub).toHaveBeenCalledOnce();
  });

  it("rejects and unsubscribes when get throws inside the listener", async () => {
    class Model extends BaseClass {
      fail = false;
    }
    const m = new Model();
    const get = vi.fn((): string | undefined => {
      if (m.fail) throw new Error("boom");
      return undefined;
    });
    const p = waitForValue(m.onUpdate, get);
    m.fail = true;
    expect(() => m.notify()).not.toThrow();
    await expect(p).rejects.toThrow("boom");
    const calls = get.mock.calls.length;
    m.notify();
    expect(get.mock.calls.length).toBe(calls);
  });

  it("returns a rejected promise when the initial get throws", async () => {
    const m = new BaseClass();
    let p: Promise<string> | undefined;
    expect(() => {
      p = waitForValue(m.onUpdate, (): string | undefined => {
        throw new Error("initial");
      });
    }).not.toThrow();
    await expect(p).rejects.toThrow("initial");
  });
});
