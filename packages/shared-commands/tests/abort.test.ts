import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Command } from "../src/command.js";
import { CommandError } from "../src/command-error.js";
import { Commands } from "../src/types.js";

const Decl = Command.required("abort:test")
  .input(z.object({}))
  .output(z.object({ y: z.string() }))
  .build();

describe("Commands — cancellation with an AbortSignal", () => {
  it("calls without options behave as before and carry no signal", async () => {
    const commands = new Commands();
    let seen: AbortSignal | undefined = new AbortController().signal;
    commands.listen(Decl, async (cmd) => {
      seen = cmd.signal;
      return { y: "ok" };
    });
    await expect(commands.call(Decl, {}).promise).resolves.toEqual({ y: "ok" });
    expect(seen).toBeUndefined();
  });

  it("a listener sees the caller's signal", async () => {
    const commands = new Commands();
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    commands.listen(Decl, async (cmd) => {
      seen = cmd.signal;
      return { y: "ok" };
    });
    await commands.call(Decl, {}, { signal: controller.signal }).promise;
    expect(seen).toBe(controller.signal);
  });

  it("aborting before the listener settles rejects with an `aborted` CommandError", async () => {
    const commands = new Commands();
    const controller = new AbortController();
    let finish!: () => void;
    commands.listen(Decl, (cmd) => {
      finish = () => cmd.resolve({ y: "late" });
      return true;
    });
    const cmd = commands.call(Decl, {}, { signal: controller.signal });
    const reason = new Error("stop");
    controller.abort(reason);
    const error = await cmd.promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({ kind: "aborted", commandKey: "abort:test", cause: reason });
    expect(cmd.settled).toBe(true);
    // A later resolve from the listener is ignored.
    finish();
    await expect(cmd.promise).rejects.toMatchObject({ kind: "aborted" });
  });

  it("a listener can stop its work when the signal aborts", async () => {
    const commands = new Commands();
    const controller = new AbortController();
    const stopped = vi.fn();
    commands.listen(Decl, (cmd) => {
      cmd.signal?.addEventListener("abort", stopped);
      return true;
    });
    const cmd = commands.call(Decl, {}, { signal: controller.signal });
    controller.abort();
    await cmd.promise.catch(() => {});
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it("an already-aborted signal rejects without running listeners", async () => {
    const commands = new Commands();
    const listener = vi.fn(async () => ({ y: "ok" }));
    commands.listen(Decl, listener);
    const controller = new AbortController();
    controller.abort();
    await expect(
      commands.call(Decl, {}, { signal: controller.signal }).promise,
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("aborting after the command settled changes nothing", async () => {
    const commands = new Commands();
    const controller = new AbortController();
    commands.listen(Decl, async () => ({ y: "done" }));
    const cmd = commands.call(Decl, {}, { signal: controller.signal });
    await expect(cmd.promise).resolves.toEqual({ y: "done" });
    controller.abort();
    await expect(cmd.promise).resolves.toEqual({ y: "done" });
  });

  it("a silent command waiting for a claimer is settled by the abort", async () => {
    const Silent = Command.silent("abort:silent").input(z.object({})).output(z.object({})).build();
    const commands = new Commands();
    const controller = new AbortController();
    const cmd = commands.call(Silent, {}, { signal: controller.signal });
    controller.abort();
    await expect(cmd.promise).rejects.toMatchObject({ kind: "aborted" });
  });
});
