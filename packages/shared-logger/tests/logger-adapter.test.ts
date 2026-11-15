import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLogger,
  getProcessId,
  type Logger,
  newConsoleLogger,
  removeLogger,
  setLogger,
} from "../src/logger.adapter.js";

describe("newConsoleLogger", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let traceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    traceSpy = vi.spyOn(console, "trace").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
    debugSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    traceSpy.mockRestore();
  });

  it("logs at the configured level and above", () => {
    const logger = newConsoleLogger("info");
    logger.info("a");
    logger.warn("b");
    logger.error("c");
    logger.debug("d"); // below threshold — skipped
    logger.trace("e"); // below threshold — skipped

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(traceSpy).not.toHaveBeenCalled();
  });

  it("skips messages below the configured level", () => {
    const logger = newConsoleLogger("warn");
    logger.info("info-skipped");
    logger.debug("debug-skipped");
    logger.warn("warn-emitted");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("includes provided metadata in every log call", () => {
    const logger = newConsoleLogger("info", { app: "demo" });
    logger.info("msg");
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), "msg", { app: "demo" });
  });

  it("emits a counter prefix and the level tag", () => {
    const logger = newConsoleLogger("info");
    logger.info("first");
    logger.info("second");
    const firstCallPrefix = infoSpy.mock.calls[0]?.[0] as string;
    const secondCallPrefix = infoSpy.mock.calls[1]?.[0] as string;
    expect(firstCallPrefix).toMatch(/^\[0000000\]\s+\[INFO\]$/);
    expect(secondCallPrefix).toMatch(/^\[0000001\]\s+\[INFO\]$/);
  });

  it("fatal routes through console.error with the FATAL tag", () => {
    const logger = newConsoleLogger("fatal");
    logger.fatal("crash");
    expect(errorSpy).toHaveBeenCalledOnce();
    const prefix = errorSpy.mock.calls[0]?.[0] as string;
    expect(prefix).toContain("[FATAL]");
  });

  it("child() merges metadata and inherits level", () => {
    const parent = newConsoleLogger("info", { app: "demo" });
    const child = parent.child({ requestId: "r-1" });
    child.info("msg");
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), "msg", {
      app: "demo",
      requestId: "r-1",
    });
  });

  it("setting an unknown level throws", () => {
    const logger = newConsoleLogger("info");
    expect(() => {
      logger.level = "loud" as Logger["level"];
    }).toThrow(/Unknown log level/);
  });

  it("setting an inherited Object property name as the level throws (#38)", () => {
    const logger = newConsoleLogger("info");
    expect(() => {
      logger.level = "toString" as Logger["level"];
    }).toThrow(/Unknown log level/);
    expect(logger.level).toBe("info");
  });

  it("level setter updates the active level", () => {
    const logger = newConsoleLogger("error");
    logger.info("filtered");
    expect(infoSpy).not.toHaveBeenCalled();
    logger.level = "info";
    logger.info("emitted");
    expect(infoSpy).toHaveBeenCalledOnce();
  });
});

describe("getProcessId", () => {
  it("creates a stable id on first call and reuses it", () => {
    const ctx: Record<string, unknown> = {};
    const a = getProcessId(ctx);
    const b = getProcessId(ctx);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns different ids for different contexts", () => {
    expect(getProcessId({})).not.toBe(getProcessId({}));
  });

  it("always returns 8 hex characters (#38)", () => {
    for (let i = 0; i < 200; i++) {
      expect(getProcessId({})).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("keeps an id already stored on the context", () => {
    const ctx: Record<string, unknown> = { "app.processId": "given" };
    expect(getProcessId(ctx)).toBe("given");
  });
});

describe("getLogger adapter", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.LOG_LEVEL;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
  });

  it("defaults to info and logs a start-up line naming this package (#38)", () => {
    const logger = getLogger({});
    expect(logger.level).toBe("info");
    const line = infoSpy.mock.calls.map((call: unknown[]) => call[1]).join("\n");
    expect(line).toContain("[shared-logger] Starting up with log level: info");
    expect(line).not.toContain("[backbone]");
  });

  it("uses LOG_LEVEL from the environment", () => {
    process.env.LOG_LEVEL = "error";
    expect(getLogger({}).level).toBe("error");
  });

  it("treats an empty LOG_LEVEL as unset (#38)", () => {
    process.env.LOG_LEVEL = "";
    expect(getLogger({}).level).toBe("info");
  });

  it("accepts LOG_LEVEL in any case (#38)", () => {
    process.env.LOG_LEVEL = "WARN";
    expect(getLogger({}).level).toBe("warn");
  });

  it.each(["bogus", "silent", "toString"])(
    "falls back to info with a warning on LOG_LEVEL=%s instead of throwing (#38)",
    (value) => {
      process.env.LOG_LEVEL = value;
      let logger: Logger | undefined;
      expect(() => {
        logger = getLogger({});
      }).not.toThrow();
      expect(logger?.level).toBe("info");
      const warning = warnSpy.mock.calls.map((call: unknown[]) => call[1]).join("\n");
      expect(warning).toContain(`Unknown LOG_LEVEL "${value}"`);
    },
  );

  it("auto-creates a logger on first lookup", () => {
    const ctx: Record<string, unknown> = {};
    const logger = getLogger(ctx);
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });

  it("setLogger / removeLogger replace the cached instance", () => {
    const ctx: Record<string, unknown> = {};
    const custom = newConsoleLogger("error");
    setLogger(ctx, custom);
    expect(getLogger(ctx)).toBe(custom);

    removeLogger(ctx);
    const fresh = getLogger(ctx);
    expect(fresh).not.toBe(custom);
  });
});
