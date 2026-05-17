import { describe, expect, it } from "vitest";
import { newAsyncGeneratorFunction } from "../src/new-async-generator-function.js";

describe("newAsyncGeneratorFunction", () => {
  it("returns a factory that yields the values delivered via next()", async () => {
    const factory = newAsyncGeneratorFunction<number>((next) => {
      next(1);
      next(2);
      next(3);
    });

    const g = factory();
    expect((await g.next()).value).toBe(1);
    expect((await g.next()).value).toBe(2);
    expect((await g.next()).value).toBe(3);
    await g.return?.(undefined);
  });

  it("each invocation returns an independent generator", async () => {
    const factory = newAsyncGeneratorFunction<string>((next) => {
      next("a");
    });
    const g1 = factory();
    const g2 = factory();
    expect(g1).not.toBe(g2);

    const r1 = await g1.next();
    const r2 = await g2.next();
    expect(r1.value).toBe("a");
    expect(r2.value).toBe("a");

    await g1.return?.(undefined);
    await g2.return?.(undefined);
  });

  it("invokes the cleanup callback when the consumer returns early", async () => {
    let cleaned = false;
    const factory = newAsyncGeneratorFunction<number>((next) => {
      next(1);
      return () => {
        cleaned = true;
      };
    });
    const g = factory();
    await g.next();
    await g.return?.(undefined);
    expect(cleaned).toBe(true);
  });
});
