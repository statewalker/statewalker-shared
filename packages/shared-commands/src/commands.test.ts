import { describe, expect, it, vi } from "vitest";
import { defineCommand } from "./define-command.js";
import { Commands } from "./types.js";

describe("Commands — dispatch model", () => {
  it("rejects with `Unhandled command` when no listener and no defaultFn", async () => {
    const cmd = defineCommand<{ x: number }, string>("test:unhandled");
    const bus = new Commands();

    const c = bus.call(cmd, { x: 1 });

    await expect(c.promise).rejects.toThrow("Unhandled command: test:unhandled");
    expect(c.settled).toBe(true);
    expect(c.handled).toBe(true);
  });

  it("listener that returns true claims, command stays pending until external resolve", async () => {
    const cmd = defineCommand<void, string>("test:claim-true");
    const bus = new Commands();

    bus.listen(cmd, () => true);

    const c = bus.call(cmd, undefined);
    expect(c.handled).toBe(true);
    expect(c.settled).toBe(false);

    Promise.resolve().then(() => c.resolve("late-value"));
    await expect(c.promise).resolves.toBe("late-value");
  });

  it("listener returning a Promise claims; bus uses the resolved value", async () => {
    const cmd = defineCommand<{ n: number }, number>("test:claim-promise");
    const bus = new Commands();

    bus.listen(cmd, (c) => Promise.resolve(c.payload.n * 2));

    const result = await bus.call(cmd, { n: 21 }).promise;
    expect(result).toBe(42);
  });

  it("listener returning a rejecting Promise rejects the command", async () => {
    const cmd = defineCommand<void, void>("test:claim-promise-reject");
    const bus = new Commands();
    const err = new Error("boom");

    bus.listen(cmd, () => Promise.reject(err));

    await expect(bus.call(cmd, undefined).promise).rejects.toBe(err);
  });

  it("listener that calls cmd.resolve directly settles the command", async () => {
    const cmd = defineCommand<void, string>("test:claim-direct");
    const bus = new Commands();

    bus.listen(cmd, (c) => {
      c.resolve("direct");
    });

    await expect(bus.call(cmd, undefined).promise).resolves.toBe("direct");
  });

  it("listener that throws rejects the command", async () => {
    const cmd = defineCommand<void, void>("test:claim-throw");
    const bus = new Commands();
    const err = new Error("kaboom");

    bus.listen(cmd, () => {
      throw err;
    });

    await expect(bus.call(cmd, undefined).promise).rejects.toBe(err);
  });

  it("listener returning void/undefined is observe-only — default still runs", async () => {
    const cmd = defineCommand<void, string>("test:observer-only", () => "default-value");
    const bus = new Commands();

    const seen: number[] = [];
    bus.listen(cmd, () => {
      seen.push(1);
      // returns undefined → observer
    });
    bus.listen(cmd, () => {
      seen.push(2);
    });

    const result = await bus.call(cmd, undefined).promise;
    expect(seen).toEqual([1, 2]);
    expect(result).toBe("default-value");
  });

  it("ALL listeners are notified even after one claims", async () => {
    const cmd = defineCommand<void, string>("test:notify-all");
    const bus = new Commands();
    const seen: string[] = [];

    bus.listen(cmd, () => {
      seen.push("first-claims");
      return true;
    });
    bus.listen(cmd, (c) => {
      seen.push(`second-sees-handled=${c.handled}`);
    });
    bus.listen(cmd, (c) => {
      seen.push(`third-sees-handled=${c.handled}`);
      c.resolve("value-from-third");
    });

    const result = await bus.call(cmd, undefined).promise;
    expect(seen).toEqual([
      "first-claims",
      "second-sees-handled=true",
      "third-sees-handled=true",
    ]);
    expect(result).toBe("value-from-third");
  });

  it("first to settle wins; later resolves no-op via settled-guard", async () => {
    const cmd = defineCommand<void, string>("test:first-settle-wins");
    const bus = new Commands();

    bus.listen(cmd, (c) => {
      c.resolve("first");
    });
    bus.listen(cmd, (c) => {
      c.resolve("second"); // no-op, settled-guard
    });

    await expect(bus.call(cmd, undefined).promise).resolves.toBe("first");
  });

  it("decl-level default runs only when no listener claimed", async () => {
    const defaultFn = vi.fn(() => "default");
    const cmd = defineCommand<void, string>("test:default-runs", defaultFn);
    const bus = new Commands();

    bus.listen(cmd, () => {
      // observer
    });

    const result = await bus.call(cmd, undefined).promise;
    expect(result).toBe("default");
    expect(defaultFn).toHaveBeenCalledTimes(1);
  });

  it("decl-level default is skipped when a listener claims", async () => {
    const defaultFn = vi.fn(() => "default");
    const cmd = defineCommand<void, string>("test:default-skipped", defaultFn);
    const bus = new Commands();

    bus.listen(cmd, () => Promise.resolve("from-listener"));

    const result = await bus.call(cmd, undefined).promise;
    expect(result).toBe("from-listener");
    expect(defaultFn).not.toHaveBeenCalled();
  });

  it("default that returns a Promise is awaited", async () => {
    const cmd = defineCommand<void, number>("test:default-promise", () => Promise.resolve(7));
    const bus = new Commands();

    await expect(bus.call(cmd, undefined).promise).resolves.toBe(7);
  });

  it("default that throws rejects the command", async () => {
    const err = new Error("default-throws");
    const cmd = defineCommand<void, void>("test:default-throws", () => {
      throw err;
    });
    const bus = new Commands();

    await expect(bus.call(cmd, undefined).promise).rejects.toBe(err);
  });

  it("noop default (silent-pending) leaves the command pending forever", async () => {
    const cmd = defineCommand<void, string>("test:silent-pending", () => {
      // noop — caller settles externally
    });
    const bus = new Commands();

    const c = bus.call(cmd, undefined);
    expect(c.settled).toBe(false);
    expect(c.handled).toBe(true); // bus marks handled to skip the loud-fail

    // External settle
    Promise.resolve().then(() => c.resolve("eventually"));
    await expect(c.promise).resolves.toBe("eventually");
  });

  it("listen() returns a disposer that removes the listener", async () => {
    const cmd = defineCommand<void, string>("test:dispose");
    const bus = new Commands();
    const fn = vi.fn(() => Promise.resolve("ok"));

    const dispose = bus.listen(cmd, fn);

    await bus.call(cmd, undefined).promise;
    expect(fn).toHaveBeenCalledTimes(1);

    dispose();

    // No listener → unhandled
    await expect(bus.call(cmd, undefined).promise).rejects.toThrow("Unhandled command:");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("multiple listeners — claiming Promise vs observer", async () => {
    const cmd = defineCommand<void, number>("test:promise-and-observer");
    const bus = new Commands();
    const observed: boolean[] = [];

    bus.listen(cmd, (c) => {
      observed.push(c.handled);
      // observer — runs first, sees nothing claimed yet
    });
    bus.listen(cmd, () => Promise.resolve(42));
    bus.listen(cmd, (c) => {
      observed.push(c.handled);
      // observer — runs after, sees handled
    });

    const result = await bus.call(cmd, undefined).promise;
    expect(result).toBe(42);
    expect(observed).toEqual([false, true]);
  });

  it("declaration is frozen and brand-distinct from raw object", () => {
    const cmd = defineCommand<{ x: number }, string>("test:frozen");
    expect(cmd.key).toBe("test:frozen");
    expect(Object.isFrozen(cmd)).toBe(true);
  });

  it("two declarations with the same key target the same dispatcher entry", async () => {
    const a = defineCommand<void, string>("test:same-key");
    const b = defineCommand<void, string>("test:same-key");
    const bus = new Commands();

    bus.listen(a, () => Promise.resolve("via-a"));

    const result = await bus.call(b, undefined).promise;
    expect(result).toBe("via-a");
  });

  it("Command three-state lifecycle exposes pending/handled/settled correctly", () => {
    const cmd = defineCommand<void, string>("test:lifecycle", () => {});
    const bus = new Commands();

    bus.listen(cmd, () => true);

    const c = bus.call(cmd, undefined);
    expect(c.handled).toBe(true);
    expect(c.settled).toBe(false);

    c.resolve("done");
    expect(c.handled).toBe(true);
    expect(c.settled).toBe(true);
  });
});
