import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Command } from "./command.js";
import { Commands } from "./types.js";

const Decl = Command.required("bus:test")
  .input(z.object({}))
  .output(z.object({ y: z.string() }))
  .build();

describe("Commands — bus semantics", () => {
  it("late listener does not observe earlier dispatches", async () => {
    const commands = new Commands();
    commands.listen(Decl, async () => ({ y: "first" }));
    await commands.call(Decl, {}).promise;

    const late = vi.fn(async () => ({ y: "late" }));
    commands.listen(Decl, late);

    await commands.call(Decl, {}).promise;
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("disposer is idempotent", () => {
    const commands = new Commands();
    const dispose = commands.listen(Decl, () => {});
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it("Commands.create() returns independent buses", async () => {
    const a = Commands.create();
    const b = Commands.create();
    expect(a).not.toBe(b);

    const aListener = vi.fn(async () => ({ y: "from-a" }));
    a.listen(Decl, aListener);

    await expect(b.call(Decl, {}).promise).rejects.toMatchObject({ kind: "no-handlers" });
    expect(aListener).not.toHaveBeenCalled();

    await expect(a.call(Decl, {}).promise).resolves.toEqual({ y: "from-a" });
    expect(aListener).toHaveBeenCalledTimes(1);
  });
});
