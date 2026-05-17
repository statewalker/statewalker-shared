import { describe, expect, it, vi } from "vitest";
import { newRegistry } from "../src/new-registry.js";

describe("newRegistry", () => {
  it("returns [register, cleanup] functions", () => {
    const [register, cleanup] = newRegistry();
    expect(register).toBeInstanceOf(Function);
    expect(cleanup).toBeInstanceOf(Function);
  });

  it("register returns a disposer that runs the listener", async () => {
    const [register] = newRegistry();
    const listener = vi.fn();
    const dispose = register(listener);
    await dispose();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("cleanup runs disposers in LIFO order", async () => {
    const [register, cleanup] = newRegistry();
    const order: string[] = [];
    register(() => {
      order.push("first");
    });
    register(() => {
      order.push("second");
    });
    register(() => {
      order.push("third");
    });

    await cleanup();
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("disposer is idempotent — second call does not re-run", async () => {
    const [register] = newRegistry();
    const listener = vi.fn();
    const dispose = register(listener);
    await dispose();
    await dispose();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("disposing a registration removes it from cleanup", async () => {
    const [register, cleanup] = newRegistry();
    const a = vi.fn();
    const b = vi.fn();
    const disposeA = register(a);
    register(b);
    await disposeA();
    a.mockClear();

    await cleanup();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("awaits async listeners", async () => {
    const [register] = newRegistry();
    let resolved = false;
    const dispose = register(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });
    await dispose();
    expect(resolved).toBe(true);
  });

  it("forwards listener errors to onError without aborting cleanup", async () => {
    const onError = vi.fn();
    const [register, cleanup] = newRegistry(onError);
    const stillRuns = vi.fn();
    register(stillRuns);
    register(() => {
      throw new Error("boom");
    });

    await cleanup();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("boom");
    expect(stillRuns).toHaveBeenCalledOnce();
  });

  it("register(undefined) returns a working no-op disposer", async () => {
    const [register, cleanup] = newRegistry();
    const dispose = register();
    await dispose();
    await cleanup();
  });

  it("cleanup with no registrations is a no-op", async () => {
    const [, cleanup] = newRegistry();
    await expect(cleanup()).resolves.toBeUndefined();
  });
});
