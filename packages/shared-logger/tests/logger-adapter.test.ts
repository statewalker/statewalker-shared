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
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it("returns different ids for different contexts", () => {
    expect(getProcessId({})).not.toBe(getProcessId({}));
  });
});

describe("getLogger adapter", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

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
