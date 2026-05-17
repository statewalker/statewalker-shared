import { getLogger } from "@statewalker/shared-logger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import initServiceLogger from "../src/index.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: "production" };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("initServiceLogger", () => {
  it("installs a pino-backed logger on the context", async () => {
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    const logger = getLogger(ctx);
    expect(logger.level).toBe("info");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("uses LOG_LEVEL from the environment", async () => {
    process.env.LOG_LEVEL = "warn";
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    expect(getLogger(ctx).level).toBe("warn");
  });

  it("emits each level through the bound pino instance", async () => {
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    const logger = getLogger(ctx);
    expect(() => {
      logger.trace("t");
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      logger.fatal("f");
    }).not.toThrow();
  });

  it("child() inherits and merges metadata without throwing", async () => {
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    const logger = getLogger(ctx);
    const child = logger.child({ requestId: "r-1" });
    expect(() => child.info("hello", { extra: 1 })).not.toThrow();
    expect(typeof child.level).toBe("string");
  });

  it("returns a noop shutdown function", async () => {
    const ctx: Record<string, unknown> = {};
    const shutdown = await initServiceLogger(ctx);
    expect(shutdown).toBeInstanceOf(Function);
    await expect(shutdown()).resolves.toBeUndefined();
  });
});
