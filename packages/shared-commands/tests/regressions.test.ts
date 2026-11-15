import type { StandardSchemaV1 } from "@standard-schema/spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Command } from "../src/command.js";
import { CommandError } from "../src/command-error.js";
import { passthrough } from "../src/passthrough.js";
import { CommandsRegistry } from "../src/registry.js";
import { Commands } from "../src/types.js";

// The package compiles against ESNext only (no DOM / Node typings), so the
// timer and the process hooks are reached through narrow typed views.
const host = globalThis as unknown as {
  setTimeout(fn: () => void, ms: number): unknown;
  process: {
    on(event: "unhandledRejection", fn: (reason: unknown) => void): void;
    off(event: "unhandledRejection", fn: (reason: unknown) => void): void;
  };
};
const tick = (ms = 10) => new Promise<void>((r) => host.setTimeout(r, ms));

function asyncSchema<T>(check: (v: unknown) => boolean = () => true): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test-async",
      async validate(value) {
        await tick(1);
        return check(value) ? { value: value as T } : { issues: [{ message: "bad value" }] };
      },
    },
  };
}

function throwingSchema<T>(): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test-throwing",
      validate() {
        throw new Error("validator boom");
      },
    },
  };
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};
beforeEach(() => {
  unhandled.length = 0;
  host.process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  host.process.off("unhandledRejection", onUnhandled);
});

describe("#18 async output schema and cmd.resolve", () => {
  it("a direct cmd.resolve with an async output schema claims under Command.required", async () => {
    const decl = Command.required("a")
      .input(passthrough<void>())
      .output(asyncSchema<number>())
      .build();
    const commands = Commands.create();
    commands.listen(decl, (cmd) => {
      cmd.resolve(1);
    });
    await expect(commands.call(decl, undefined).promise).resolves.toBe(1);
  });

  it("first call wins: resolve then reject ends resolved", async () => {
    const decl = Command.silent("a")
      .input(passthrough<void>())
      .output(asyncSchema<number>())
      .build();
    const c = Commands.create().call(decl, undefined);
    c.resolve(1);
    c.reject(new Error("late"));
    expect(c.settled).toBe(true);
    await expect(c.promise).resolves.toBe(1);
  });

  it("first call wins: two resolves keep the first", async () => {
    const decl = Command.silent("a")
      .input(passthrough<void>())
      .output(asyncSchema<number>())
      .build();
    const c = Commands.create().call(decl, undefined);
    c.resolve(1);
    c.resolve(2);
    await expect(c.promise).resolves.toBe(1);
  });

  it("an async output schema rejecting the value settles as output-validation", async () => {
    const decl = Command.required("a")
      .input(passthrough<void>())
      .output(asyncSchema<number>((v) => v === 1))
      .build();
    const commands = Commands.create();
    commands.listen(decl, async () => 2);
    await expect(commands.call(decl, undefined).promise).rejects.toMatchObject({
      kind: "output-validation",
    });
  });

  it("async input schema dispatches after validation", async () => {
    const decl = Command.required("a")
      .input(asyncSchema<{ x: number }>((v) => typeof (v as { x: unknown }).x === "number"))
      .output(passthrough<number>())
      .build();
    const commands = Commands.create();
    commands.listen(decl, async (cmd) => cmd.payload.x * 2);
    await expect(commands.call(decl, { x: 2 }).promise).resolves.toBe(4);
    await expect(
      commands.call(decl, { x: "no" } as unknown as { x: number }).promise,
    ).rejects.toMatchObject({ kind: "input-validation" });
  });
});

describe("#19 throwing validators", () => {
  it("a throwing input validator rejects with input-validation instead of throwing", async () => {
    const decl = Command.required("a")
      .input(throwingSchema<number>())
      .output(passthrough<number>())
      .build();
    const commands = Commands.create();
    let cmd: ReturnType<typeof commands.call<number, number>> | undefined;
    expect(() => {
      cmd = commands.call(decl, 1);
    }).not.toThrow();
    const err = await cmd?.promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ kind: "input-validation" });
    expect((err as Error).cause).toMatchObject({ message: "validator boom" });
  });

  it("a throwing output validator on a listener promise rejects with output-validation", async () => {
    const decl = Command.required("a")
      .input(passthrough<void>())
      .output(throwingSchema<number>())
      .build();
    const commands = Commands.create();
    const listener = async () => 1;
    commands.listen(decl, listener);
    const err = await commands.call(decl, undefined).promise.catch((e: unknown) => e);
    await tick();
    expect(unhandled).toEqual([]);
    expect(err).toMatchObject({ kind: "output-validation", listener });
    expect((err as Error).cause).toMatchObject({ message: "validator boom" });
  });

  it("a throwing output validator on a direct cmd.resolve rejects with output-validation", async () => {
    const decl = Command.silent("a")
      .input(passthrough<void>())
      .output(throwingSchema<number>())
      .build();
    const c = Commands.create().call(decl, undefined);
    expect(() => c.resolve(1)).not.toThrow();
    await expect(c.promise).rejects.toMatchObject({ kind: "output-validation" });
  });
});

describe("#20 validated values reach listeners and callers", () => {
  it("listeners receive the transformed and defaulted payload", async () => {
    const decl = Command.required("a")
      .input(z.object({ n: z.string().transform(Number), d: z.number().default(7) }))
      .output(z.number())
      .build();
    const commands = Commands.create();
    let seen: unknown;
    commands.listen(decl, async (cmd) => {
      seen = cmd.payload;
      return cmd.payload.n + cmd.payload.d;
    });
    const raw = { n: "5" } as unknown as { n: number; d: number };
    await expect(commands.call(decl, raw).promise).resolves.toBe(12);
    expect(seen).toEqual({ n: 5, d: 7 });
  });

  it("callers receive the validated output value (listener promise and direct resolve)", async () => {
    const decl = Command.required("a")
      .input(passthrough<boolean>())
      .output(z.string().transform((s) => s.length))
      .build();
    const commands = Commands.create();
    commands.listen(decl, (cmd) => {
      if (cmd.payload) {
        cmd.resolve("abc" as unknown as number);
        return;
      }
      return Promise.resolve("abcd" as unknown as number);
    });
    await expect(commands.call(decl, true).promise).resolves.toBe(3);
    await expect(commands.call(decl, false).promise).resolves.toBe(4);
  });
});

describe("#31 namespace views", () => {
  const P = Command.required("p").input(passthrough<void>()).output(passthrough<void>()).build();

  it("list/get do not evaluate the JSON-schema getters", async () => {
    const reads: string[] = [];
    const decl = Object.freeze({
      ...P,
      get inputJsonSchema(): Promise<Record<string, unknown>> {
        reads.push("in");
        return Promise.resolve({});
      },
      get outputJsonSchema(): Promise<Record<string, unknown>> {
        reads.push("out");
        return Promise.resolve({});
      },
    });
    const ns = CommandsRegistry.namespace(CommandsRegistry.create(decl), "x:");
    ns.list();
    const w = ns.get("x:p");
    expect(reads).toEqual([]);
    await w?.inputJsonSchema;
    expect(reads).toEqual(["in"]);
  });

  it("wrappers are identity-stable and keep the prefixed key", () => {
    const ns = CommandsRegistry.namespace(CommandsRegistry.create(P), "x:");
    const a = ns.get("x:p");
    expect(a).toBe(ns.get("x:p"));
    expect(ns.list()[0]).toBe(a);
    expect(a?.key).toBe("x:p");
    expect(a?.policy).toBe(P.policy);
    expect(Object.isFrozen(a)).toBe(true);
    const reg = CommandsRegistry.create();
    if (a) {
      reg.set(a);
      expect(() => reg.set(a)).not.toThrow();
      expect(() => reg.set(ns.get("x:p") as typeof a)).not.toThrow();
    }
  });

  it("passthrough declarations derive an empty JSON schema", async () => {
    await expect(P.inputJsonSchema).resolves.toEqual({});
    await expect(P.outputJsonSchema).resolves.toEqual({});
    const ns = CommandsRegistry.namespace(CommandsRegistry.create(P), "x:");
    await expect(ns.get("x:p")?.inputJsonSchema).resolves.toEqual({});
    await tick();
    expect(unhandled).toEqual([]);
  });

  it("seed collision uses the documented RangeError message", () => {
    const P2 = Command.required("p").input(passthrough<void>()).output(passthrough<void>()).build();
    expect(() => CommandsRegistry.create(P, P2)).toThrow(
      new RangeError('CommandsRegistry: key "p" already registered with a different declaration'),
    );
  });
});

describe("#32 builder stages are immutable", () => {
  it("branches from a shared stage do not share state", () => {
    const base = Command.required("f").input(passthrough<void>());
    const one = base.output(passthrough<number>()).label("one").build();
    const two = base.output(passthrough<string>()).label("two").build();
    expect(one.label).toBe("one");
    expect(two.label).toBe("two");
    expect(one.outputSchema).toBe(two.outputSchema); // both passthrough singletons
  });

  it("a later metadata call does not change an earlier stage", () => {
    const stage = Command.required("f").input(passthrough<void>()).output(passthrough<void>());
    const labelled = stage.label("L");
    expect(stage.build().label).toBeUndefined();
    expect(labelled.build().label).toBe("L");
    expect(() => labelled.label("again")).toThrow("label already set");
  });
});
