import { describe, expect, it } from "vitest";
import { newAsyncGenerator } from "../src/new-async-generator.js";
import { newAsyncGeneratorFunction } from "../src/new-async-generator-function.js";

async function delay(ms: number = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Resolves to "pending" if `p` has not settled within `ms`. */
async function settledWithin<T>(p: Promise<T>, ms = 50): Promise<T | "pending"> {
  return Promise.race([p, delay(ms).then(() => "pending" as const)]);
}

async function collect<T>(gen: AsyncIterable<T>): Promise<{ values: T[]; error?: unknown }> {
  const values: T[] = [];
  try {
    for await (const v of gen) values.push(v);
    return { values };
  } catch (error) {
    return { values, error };
  }
}

describe("newAsyncGenerator() skip mode (#22)", () => {
  it("keeps the last value queued before done()", async () => {
    const gen = newAsyncGenerator<number>((next, done) => {
      next(1);
      next(2);
      next(3);
      done();
    }, true);
    expect(await collect(gen)).toEqual({ values: [3] });
  });

  it("does not swallow done(err) when next() follows it", async () => {
    const boom = new Error("boom");
    let lateNext: Promise<boolean> | undefined;
    const gen = newAsyncGenerator<number>((next, done) => {
      done(boom);
      lateNext = next(9);
    }, true);
    const result = await collect(gen);
    expect(result.values).toEqual([]);
    expect(result.error).toBe(boom);
    expect(await lateNext).toBe(false);
  });

  it("resolves skipped values with false and the delivered one with true", async () => {
    const acks: Promise<boolean>[] = [];
    const gen = newAsyncGenerator<number>((next, done) => {
      acks.push(next(1), next(2), next(3));
      done();
    }, true);
    await collect(gen);
    expect(await Promise.all(acks)).toEqual([false, false, true]);
  });
});

describe("newAsyncGenerator() next() after done() (#22)", () => {
  it("resolves next() with false at once once done() is queued", async () => {
    let late: Promise<boolean> | undefined;
    const gen = newAsyncGenerator<number>((next, done) => {
      next(1);
      done();
      late = next(2);
    });
    // Before the consumer has pulled anything, the late value is already refused.
    await gen.next();
    expect(await settledWithin(late as Promise<boolean>)).toBe(false);
    await gen.return(undefined);
  });
});

describe("newAsyncGenerator() init errors (#23)", () => {
  it("maps a rejecting async init to done(err)", async () => {
    const failure = new Error("producer failed");
    const gen = newAsyncGenerator<number>(async (next) => {
      await next(1);
      throw failure;
    });
    expect(await gen.next()).toEqual({ done: false, value: 1 });
    const second = settledWithin(gen.next().catch((e) => ({ rejected: e })));
    expect(await second).toEqual({ rejected: failure });
  });

  it("maps a synchronous throw from init to done(err)", async () => {
    const failure = new Error("init failed");
    const gen = newAsyncGenerator<number>(() => {
      throw failure;
    });
    expect(await collect(gen)).toEqual({ values: [], error: failure });
  });

  it("uses a cleanup function resolved by an async init", async () => {
    let cleaned = false;
    const gen = newAsyncGenerator<number>(async (next, done) => {
      await delay(1);
      next(1);
      done();
      return () => {
        cleaned = true;
      };
    });
    expect(await collect(gen)).toEqual({ values: [1] });
    expect(cleaned).toBe(true);
  });

  it("calls a cleanup that an async init resolves after the generator has finished", async () => {
    let cleaned = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const gen = newAsyncGenerator<number>(async (next) => {
      next(1);
      await gate;
      return () => {
        cleaned = true;
      };
    });
    await gen.next();
    await gen.return(undefined);
    expect(cleaned).toBe(false);
    release();
    await delay(1);
    expect(cleaned).toBe(true);
  });
});

describe("newAsyncGenerator() throwing cleanup (#24)", () => {
  it("still resolves pending producers with false when cleanup throws", async () => {
    let pending: Promise<boolean> | undefined;
    const gen = newAsyncGenerator<number>((next) => {
      next(1);
      pending = next(2);
      return () => {
        throw new Error("cleanup failed");
      };
    });
    let caught: unknown;
    try {
      for await (const _ of gen) break;
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toBe("cleanup failed");
    expect(await settledWithin(pending as Promise<boolean>)).toBe(false);
  });

  it("keeps the done(err) error and attaches the cleanup error as its cause", async () => {
    const original = new Error("original");
    const cleanupError = new Error("cleanup failed");
    const gen = newAsyncGenerator<number>((_next, done) => {
      done(original);
      return () => {
        throw cleanupError;
      };
    });
    const result = await collect(gen);
    expect(result.error).toBe(original);
    expect((result.error as Error).cause).toBe(cleanupError);
  });
});

describe("newAsyncGenerator() return() while the consumer waits (#34)", () => {
  it("settles the pending next() and runs cleanup", async () => {
    let cleaned = false;
    const gen = newAsyncGenerator<number>(() => () => {
      cleaned = true;
    });
    const pendingNext = gen.next();
    const ret = gen.return(undefined);
    expect(await settledWithin(pendingNext)).toEqual({ done: true, value: undefined });
    expect(await settledWithin(ret)).toEqual({ done: true, value: undefined });
    expect(cleaned).toBe(true);
  });

  it("works through newAsyncGeneratorFunction too", async () => {
    let cleaned = false;
    const gen = newAsyncGeneratorFunction<number>(() => () => {
      cleaned = true;
    })();
    const pendingNext = gen.next();
    const ret = gen.return(undefined);
    expect(await settledWithin(pendingNext)).toEqual({ done: true, value: undefined });
    expect(await settledWithin(ret)).toEqual({ done: true, value: undefined });
    expect(cleaned).toBe(true);
  });

  it("does not run init when return() comes before the first pull", async () => {
    let started = false;
    const gen = newAsyncGenerator<number>(() => {
      started = true;
    });
    expect(await gen.return(undefined)).toEqual({ done: true, value: undefined });
    expect(started).toBe(false);
  });
});

describe("newAsyncGenerator() done(null) (#34)", () => {
  it("completes normally on done(null)", async () => {
    const gen = newAsyncGenerator<number, Error | null>((next, done) => {
      next(1);
      done(null);
    });
    expect(await collect(gen)).toEqual({ values: [1] });
  });
});

describe("newAsyncGenerator() init is lazy (#34)", () => {
  it("runs init on the first pull, not on creation", async () => {
    let started = false;
    const gen = newAsyncGenerator<number>((next, done) => {
      started = true;
      next(1);
      done();
    });
    expect(started).toBe(false);
    await gen.next();
    expect(started).toBe(true);
    await gen.return(undefined);
  });
});
