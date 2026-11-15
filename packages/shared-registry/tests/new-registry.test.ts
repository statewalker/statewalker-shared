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
    expect((onError.mock.calls[0]?.[0] as Error | undefined)?.message).toBe("boom");
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
  describe("concurrent cleanup and dispose (#25)", () => {
    const tick = () => new Promise<void>((r) => setTimeout(r, 5));

    it("two concurrent cleanup() calls keep serial LIFO order and both await completion", async () => {
      const [register, cleanup] = newRegistry();
      const log: string[] = [];
      register(async () => {
        log.push("close:start");
        await tick();
        log.push("close:end");
      });
      register(async () => {
        log.push("flush:start");
        await tick();
        log.push("flush:end");
      });

      const first = cleanup().then(() => log.push("first cleanup resolved"));
      const second = cleanup().then(() => log.push("second cleanup resolved"));
      await Promise.all([first, second]);
      expect(log.slice(0, 4)).toEqual(["flush:start", "flush:end", "close:start", "close:end"]);
      expect(log.slice(4).sort()).toEqual(["first cleanup resolved", "second cleanup resolved"]);
    });

    it("cleanup() returns the in-flight cleanup promise", async () => {
      const [register, cleanup] = newRegistry();
      register(tick);
      const a = cleanup();
      const b = cleanup();
      expect(b).toBe(a);
      await a;
    });

    it("a second call of the same disposer waits for the listener to finish", async () => {
      const [register] = newRegistry();
      let done = false;
      const listener = vi.fn(async () => {
        await tick();
        done = true;
      });
      const dispose = register(listener);
      void dispose();
      await dispose();
      expect(done).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    });

    it("cleanup() waits for a disposer already in flight before running older listeners", async () => {
      const [register, cleanup] = newRegistry();
      const log: string[] = [];
      register(() => {
        log.push("older");
      });
      const dispose = register(async () => {
        log.push("newer:start");
        await tick();
        log.push("newer:end");
      });
      void dispose();
      await cleanup();
      expect(log).toEqual(["newer:start", "newer:end", "older"]);
    });

    it("a disposer called after cleanup() started waits for its listener", async () => {
      const [register, cleanup] = newRegistry();
      let done = false;
      const dispose = register(async () => {
        await tick();
        done = true;
      });
      void cleanup();
      await dispose();
      expect(done).toBe(true);
    });
  });

  describe("throwing onError (#26)", () => {
    it("a throwing onError does not abort the rest of cleanup", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const ran: string[] = [];
        const [register, cleanup] = newRegistry(() => {
          throw new Error("logger down");
        });
        register(() => {
          ran.push("earlier");
        });
        register(() => {
          throw new Error("boom");
        });
        await expect(cleanup()).resolves.toBeUndefined();
        expect(ran).toEqual(["earlier"]);
        expect(consoleError).toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("a throwing onError does not make the disposer reject", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const [register] = newRegistry(() => {
          throw new Error("logger down");
        });
        const dispose = register(() => {
          throw new Error("boom");
        });
        await expect(dispose()).resolves.toBeUndefined();
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("callbacks registered during cleanup (#36)", () => {
    it("runs callbacks registered while cleanup() is running", async () => {
      const [register, cleanup] = newRegistry();
      const log: string[] = [];
      register(() => {
        log.push("first");
      });
      register(() => {
        log.push("second");
        register(() => {
          log.push("late");
        });
      });
      await cleanup();
      expect(log).toEqual(["second", "late", "first"]);
    });
  });
});
