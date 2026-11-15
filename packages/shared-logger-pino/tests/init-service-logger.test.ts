import { Writable } from "node:stream";
import { getLogger } from "@statewalker/shared-logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the production JSON output: `pino.destination(fd)` is replaced with an
// in-memory stream, so every other part of the real code path stays in place.
const sink = vi.hoisted(() => ({ lines: [] as string[] }));

vi.mock("pino", async (importOriginal) => {
  const mod = await importOriginal<typeof import("pino")>();
  const real = mod.default;
  const destination = vi.fn(
    () =>
      new Writable({
        write(chunk, _enc, cb) {
          for (const line of String(chunk).split("\n")) {
            if (line) sink.lines.push(line);
          }
          cb();
        },
      }),
  );
  const fake = Object.assign((...args: Parameters<typeof real>) => real(...args), real, {
    destination,
  });
  return { ...mod, default: fake };
});

const { default: initServiceLogger, newPinoLogger } = await import("../src/index.js");

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: "production" };
  delete process.env.LOG_LEVEL;
  sink.lines.length = 0;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function records(): Record<string, unknown>[] {
  return sink.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function last(): Record<string, unknown> {
  const all = records();
  const record = all[all.length - 1];
  if (!record) throw new Error("nothing was logged");
  return record;
}

describe("newPinoLogger output (production JSON)", () => {
  it("writes the level as a label, an ISO time and the bound metadata", () => {
    const logger = newPinoLogger("info", { processId: "p-1" });
    logger.info("hello");
    const record = last();
    expect(record.level).toBe("info");
    expect(record.msg).toBe("hello");
    expect(record.processId).toBe("p-1");
    expect(typeof record.time).toBe("string");
    expect(Number.isNaN(Date.parse(record.time as string))).toBe(false);
  });

  it("one argument is passed to pino unchanged", () => {
    const logger = newPinoLogger("info");
    logger.info({ a: 1 });
    expect(last()).toMatchObject({ a: 1 });
    expect(last()).not.toHaveProperty("extra");
  });

  it("a lone Error is serialized under err with its message", () => {
    const logger = newPinoLogger("info");
    logger.error(new Error("boom"));
    const record = last();
    expect(record.msg).toBe("boom");
    expect(record.err).toMatchObject({ type: "Error", message: "boom" });
    expect((record.err as { stack: string }).stack).toContain("boom");
  });

  it("string first, one more value: the value goes to extra as is", () => {
    const logger = newPinoLogger("info");
    logger.info("msg", { port: 3000 });
    expect(last()).toMatchObject({ msg: "msg", extra: { port: 3000 } });
  });

  it("string first, several more values: they go to extra as an array", () => {
    const logger = newPinoLogger("info");
    logger.info("msg", 1, "two", { three: 3 });
    expect(last()).toMatchObject({ msg: "msg", extra: [1, "two", { three: 3 }] });
  });

  it("string first, then an Error: the Error goes to err with message and stack (#29)", () => {
    const logger = newPinoLogger("info");
    logger.error("request failed", new Error("boom"));
    const record = last();
    expect(record.msg).toBe("request failed");
    expect(record.err).toMatchObject({ type: "Error", message: "boom" });
    expect((record.err as { stack: string }).stack).toContain("boom");
    expect(record).not.toHaveProperty("extra");
  });

  it("string first, an Error among other values: err holds the Error, extra the rest (#29)", () => {
    const logger = newPinoLogger("info");
    logger.error("request failed", new Error("boom"), { a: 1 });
    const record = last();
    expect(record.err).toMatchObject({ type: "Error", message: "boom" });
    expect(record.extra).toEqual({ a: 1 });
  });

  it("string first, several Errors: the first goes to err, the others are serialized (#29)", () => {
    const logger = newPinoLogger("info");
    logger.error("two failures", new Error("first"), new TypeError("second"), 3);
    const record = last();
    expect(record.err).toMatchObject({ type: "Error", message: "first" });
    expect(record.extra).toEqual([
      expect.objectContaining({ type: "TypeError", message: "second" }),
      3,
    ]);
  });

  it("non-string first: logged as args, with Errors serialized (#29)", () => {
    const logger = newPinoLogger("info");
    logger.warn({ a: 1 }, 2);
    expect(last()).toMatchObject({ args: [{ a: 1 }, 2] });

    logger.error(new Error("boom"), { a: 1 });
    const args = last().args as unknown[];
    expect(args[0]).toMatchObject({ type: "Error", message: "boom" });
    expect((args[0] as { stack: string }).stack).toContain("boom");
    expect(args[1]).toEqual({ a: 1 });
  });

  it("no arguments: nothing is logged", () => {
    const logger = newPinoLogger("info");
    logger.info();
    expect(sink.lines).toHaveLength(0);
  });

  it("messages below the level are dropped; the level can be changed", () => {
    const logger = newPinoLogger("warn");
    logger.info("dropped");
    expect(sink.lines).toHaveLength(0);
    logger.level = "debug";
    expect(logger.level).toBe("debug");
    logger.debug("kept");
    expect(last()).toMatchObject({ level: "debug", msg: "kept" });
  });

  it("emits each level with its label", () => {
    const logger = newPinoLogger("trace");
    logger.trace("t");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    expect(records().map((r) => [r.level, r.msg])).toEqual([
      ["trace", "t"],
      ["debug", "d"],
      ["info", "i"],
      ["warn", "w"],
      ["error", "e"],
      ["fatal", "f"],
    ]);
  });

  it("child() merges metadata onto every line", () => {
    const logger = newPinoLogger("info", { app: "demo" });
    logger.child({ requestId: "r-1" }).info("hello", { extra: 1 });
    expect(last()).toMatchObject({
      app: "demo",
      requestId: "r-1",
      msg: "hello",
      extra: { extra: 1 },
    });
  });
});

describe("initServiceLogger", () => {
  it("installs a pino-backed logger on the context and logs the start-up line", async () => {
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    const logger = getLogger(ctx);
    expect(logger.level).toBe("info");
    expect(ctx.logger).toBe(logger.info);
    expect(last()).toMatchObject({
      level: "info",
      msg: "[service-logger] Pino logger initialized",
      processId: ctx["app.processId"],
    });
  });

  it("uses LOG_LEVEL from the environment", async () => {
    process.env.LOG_LEVEL = "warn";
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    expect(getLogger(ctx).level).toBe("warn");
  });

  it("treats an empty LOG_LEVEL as unset (#38)", async () => {
    process.env.LOG_LEVEL = "";
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    expect(getLogger(ctx).level).toBe("info");
  });

  it("accepts LOG_LEVEL in any case (#38)", async () => {
    process.env.LOG_LEVEL = "DEBUG";
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    expect(getLogger(ctx).level).toBe("debug");
  });

  it("accepts pino's silent level", async () => {
    process.env.LOG_LEVEL = "silent";
    const ctx: Record<string, unknown> = {};
    await initServiceLogger(ctx);
    expect(getLogger(ctx).level).toBe("silent");
    expect(sink.lines).toHaveLength(0);
  });

  it("falls back to info with a warning on an unknown LOG_LEVEL (#38)", async () => {
    process.env.LOG_LEVEL = "bogus";
    const ctx: Record<string, unknown> = {};
    await expect(initServiceLogger(ctx)).resolves.toBeInstanceOf(Function);
    expect(getLogger(ctx).level).toBe("info");
    const warning = records().find((r) => r.level === "warn");
    expect(warning?.msg).toContain('Unknown LOG_LEVEL "bogus"');
  });

  it("returns a noop shutdown function", async () => {
    const ctx: Record<string, unknown> = {};
    const shutdown = await initServiceLogger(ctx);
    expect(shutdown).toBeInstanceOf(Function);
    await expect(shutdown()).resolves.toBeUndefined();
  });
});

describe("newPinoLogger outside production (pino-pretty transport)", () => {
  it("creates a logger and logs messages and Errors without throwing", () => {
    process.env.NODE_ENV = "development";
    const logger = newPinoLogger("info", { component: "smoke" }, { destination: 2 });
    expect(logger.level).toBe("info");
    expect(() => {
      logger.info("smoke test");
      logger.error("smoke failure", new Error("boom"));
      logger.child({ requestId: "r-1" }).warn({ a: 1 }, 2);
    }).not.toThrow();
    // The JSON destination is the production path only.
    expect(sink.lines).toHaveLength(0);
  });
});
