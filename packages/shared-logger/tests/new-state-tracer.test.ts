import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newConsoleLogger, setLogger } from "../src/logger.adapter.js";
import { newStateTracer } from "../src/new-state-tracer.js";

describe("newStateTracer", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("emits open and close tags from the logger at the requested level", async () => {
    const trace = newStateTracer("info");
    const ctx: Record<string, unknown> = {
      "fsm:states": ["root", "loading"],
      "fsm:event": "tick",
    };
    setLogger(ctx, newConsoleLogger("info"));

    const close = await trace(ctx);
    close();

    expect(infoSpy).toHaveBeenCalledTimes(2);
    const open = infoSpy.mock.calls[0]?.[1] as string;
    const closed = infoSpy.mock.calls[1]?.[1] as string;
    expect(open).toBe('  <loading event="tick">');
    expect(closed).toBe("  </loading>");
  });

  it("handles missing fsm state stack gracefully", async () => {
    const trace = newStateTracer("info");
    const ctx: Record<string, unknown> = {};
    setLogger(ctx, newConsoleLogger("info"));

    const close = await trace(ctx);
    close();

    expect(infoSpy).toHaveBeenCalledTimes(2);
    const open = infoSpy.mock.calls[0]?.[1] as string;
    expect(open).toBe('< event="">');
  });
});
