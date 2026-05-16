import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Command } from "./command.js";
import { CommandError } from "./command-error.js";
import { Commands } from "./types.js";

const inputSchema = z.object({ x: z.number() });
const outputSchema = z.object({ y: z.string() });

const PingCommand = Command.required("test:ping").input(inputSchema).output(outputSchema).build();

describe("Commands — dispatch lifecycle", () => {
  it("input validation rejects before any listener is invoked", async () => {
    const commands = new Commands();
    const listener = vi.fn();
    commands.listen(PingCommand, listener);

    const cmd = commands.call(PingCommand, { x: "bad" as unknown as number });

    await expect(cmd.promise).rejects.toBeInstanceOf(CommandError);
    await cmd.promise.catch((e: CommandError) => {
      expect(e.kind).toBe("input-validation");
      expect(e.commandKey).toBe("test:ping");
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("output validation rejects on bad resolve and reports the listener", async () => {
    const commands = new Commands();
    const badListener = vi.fn(() => Promise.resolve({ y: 42 as unknown as string }));
    commands.listen(PingCommand, badListener);

    const cmd = commands.call(PingCommand, { x: 1 });

    await expect(cmd.promise).rejects.toBeInstanceOf(CommandError);
    await cmd.promise.catch((e: CommandError) => {
      expect(e.kind).toBe("output-validation");
      expect(e.commandKey).toBe("test:ping");
      expect(e.listener).toBe(badListener);
    });
  });

  it("priority order determines invocation", async () => {
    const commands = new Commands();
    const order: string[] = [];
    commands.listen(PingCommand, () => {
      order.push("default");
    });
    commands.listen(
      PingCommand,
      () => {
        order.push("high");
      },
      { priority: 100 },
    );
    commands.listen(
      PingCommand,
      () => {
        order.push("low");
      },
      { priority: -1 },
    );
    commands.listen(PingCommand, () => Promise.resolve({ y: "ok" }), { priority: 1 });

    await commands.call(PingCommand, { x: 1 }).promise;
    expect(order).toEqual(["high", "default", "low"]);
  });

  it("same priority invocation is the set, not order-dependent", async () => {
    const commands = new Commands();
    const seen = new Set<string>();
    commands.listen(PingCommand, () => {
      seen.add("a");
    });
    commands.listen(PingCommand, () => {
      seen.add("b");
    });
    commands.listen(PingCommand, () => Promise.resolve({ y: "ok" }));

    await commands.call(PingCommand, { x: 1 }).promise;
    expect(seen).toEqual(new Set(["a", "b"]));
  });

  it("listener `return true` claims pending and skips policy enforcement", async () => {
    const commands = new Commands();
    commands.listen(PingCommand, () => true);

    const cmd = commands.call(PingCommand, { x: 1 });
    let resolved = false;
    cmd.promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    cmd.resolve({ y: "external" });
    await expect(cmd.promise).resolves.toEqual({ y: "external" });
  });

  it("listener `Promise<R>` claims and settles after validation", async () => {
    const commands = new Commands();
    commands.listen(PingCommand, async () => ({ y: "got" }));

    const result = await commands.call(PingCommand, { x: 1 }).promise;
    expect(result).toEqual({ y: "got" });
  });

  it("listener throw → CommandError('listener-threw') with cause and listener", async () => {
    const commands = new Commands();
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    commands.listen(PingCommand, thrower);

    const cmd = commands.call(PingCommand, { x: 1 });
    await expect(cmd.promise).rejects.toBeInstanceOf(CommandError);
    await cmd.promise.catch((e: CommandError) => {
      expect(e.kind).toBe("listener-threw");
      expect((e.cause as Error).message).toBe("boom");
      expect(e.listener).toBe(thrower);
    });
  });

  it("rejected listener promise → CommandError('listener-threw')", async () => {
    const commands = new Commands();
    const rejector = vi.fn(() => Promise.reject(new Error("nope")));
    commands.listen(PingCommand, rejector);

    const cmd = commands.call(PingCommand, { x: 1 });
    await expect(cmd.promise).rejects.toBeInstanceOf(CommandError);
    await cmd.promise.catch((e: CommandError) => {
      expect(e.kind).toBe("listener-threw");
      expect((e.cause as Error).message).toBe("nope");
      expect(e.listener).toBe(rejector);
    });
  });

  it("multi-resolve is no-op via settled-guard", async () => {
    const commands = new Commands();
    commands.listen(PingCommand, (cmd) => {
      cmd.resolve({ y: "first" });
      cmd.resolve({ y: "second" });
      cmd.reject(new Error("ignored"));
    });

    const result = await commands.call(PingCommand, { x: 1 }).promise;
    expect(result).toEqual({ y: "first" });
  });
});
