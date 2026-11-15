import type { StandardSchemaV1 } from "@standard-schema/spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "../src/command.js";
import { CommandError } from "../src/command-error.js";
import { passthrough } from "../src/passthrough.js";
import { ASYNC, type DispatchPolicy, REQUIRED, SILENT } from "../src/policy.js";
import type { CommandListener, Command as DispatchedCommand } from "../src/types.js";
import { Commands } from "../src/types.js";

// One command lifecycle (#40): every settlement route goes through the same
// pending → claimed → validating → settled path, whatever the output
// validator does. The matrix below drives it through `call` / `listen` only.

const host = globalThis as unknown as {
  setTimeout(fn: () => void, ms: number): unknown;
  process: {
    on(event: "unhandledRejection", fn: (reason: unknown) => void): void;
    off(event: "unhandledRejection", fn: (reason: unknown) => void): void;
  };
};
const tick = (ms = 5) => new Promise<void>((r) => host.setTimeout(r, ms));

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

type ValidatorKind = "sync" | "async" | "throwing";

/** Output schema multiplying the value by 10, so the caller sees the validated value. */
function outputSchema(kind: ValidatorKind, calls: { n: number }): StandardSchemaV1<number, number> {
  const check = (value: unknown): StandardSchemaV1.Result<number> => {
    calls.n++;
    if (kind === "throwing") throw new Error("validator boom");
    return typeof value === "number" ? { value: value * 10 } : { issues: [{ message: "nan" }] };
  };
  return {
    "~standard": {
      version: 1,
      vendor: "test-lifecycle",
      validate:
        kind === "async"
          ? async (value) => {
              await tick(1);
              return check(value);
            }
          : check,
    },
  };
}

type Route = "resolve" | "promise" | "true" | "throw" | "reject";

const POLICIES: [string, DispatchPolicy][] = [
  ["required", REQUIRED],
  ["async", ASYNC],
  ["silent", SILENT],
];
const VALIDATORS: ValidatorKind[] = ["sync", "async", "throwing"];
const ROUTES: Route[] = ["resolve", "promise", "true", "throw", "reject"];

const listenerError = new Error("listener failed");

function listenerFor(route: Route): CommandListener<void, number> {
  switch (route) {
    case "resolve":
      return (cmd) => {
        cmd.resolve(1);
      };
    case "promise":
      return () => Promise.resolve(1);
    case "true":
      return () => true;
    case "throw":
      return () => {
        throw listenerError;
      };
    case "reject":
      return (cmd) => {
        cmd.reject(listenerError);
      };
  }
}

describe("command lifecycle matrix: validator × route × policy", () => {
  for (const [policyName, policy] of POLICIES) {
    for (const validator of VALIDATORS) {
      for (const route of ROUTES) {
        it(`${policyName} / ${validator} validator / ${route}`, async () => {
          const calls = { n: 0 };
          const decl = Command.custom(`m:${policyName}`, policy)
            .input(passthrough<void>())
            .output(outputSchema(validator, calls))
            .build();
          const commands = Commands.create();
          const listener = listenerFor(route);
          commands.listen(decl, listener);

          const cmd = commands.call(decl, undefined);
          if (route === "true") {
            await tick();
            expect(cmd.settled).toBe(false);
            cmd.resolve(1);
          }
          const outcome = await cmd.promise.then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          );
          await tick();

          if (route === "throw") {
            expect(outcome).toMatchObject({ error: { kind: "listener-threw", listener } });
            expect((outcome as { error: Error }).error.cause).toBe(listenerError);
            expect(calls.n).toBe(0);
          } else if (route === "reject") {
            expect(outcome).toEqual({ error: listenerError });
            expect(calls.n).toBe(0);
          } else if (validator === "throwing") {
            const error = (outcome as { error: CommandError }).error;
            expect(error).toBeInstanceOf(CommandError);
            expect(error.kind).toBe("output-validation");
            expect(error.listener).toBe(route === "promise" ? listener : undefined);
            expect(calls.n).toBe(1);
          } else {
            expect(outcome).toEqual({ value: 10 });
            // Validated once per settlement, whatever the route.
            expect(calls.n).toBe(1);
          }
          expect(cmd.settled).toBe(true);
          expect(unhandled).toEqual([]);
        });
      }
    }
  }
});

describe("command lifecycle: unclaimed commands follow the policy", () => {
  const cases: [string, DispatchPolicy, "observer" | "none", string | "pending"][] = [
    ["required", REQUIRED, "none", "no-handlers"],
    ["required", REQUIRED, "observer", "not-claimed"],
    ["async", ASYNC, "none", "no-handlers"],
    ["async", ASYNC, "observer", "pending"],
    ["silent", SILENT, "none", "pending"],
    ["silent", SILENT, "observer", "pending"],
  ];
  for (const [name, policy, listeners, expected] of cases) {
    it(`${name} with ${listeners} listeners → ${expected}`, async () => {
      const decl = Command.custom(`u:${name}`, policy)
        .input(passthrough<void>())
        .output(passthrough<number>())
        .build();
      const commands = Commands.create();
      if (listeners === "observer") commands.listen(decl, () => {});
      const cmd = commands.call(decl, undefined);
      let outcome: unknown = "pending";
      cmd.promise.then(
        (v) => {
          outcome = v;
        },
        (e: CommandError) => {
          outcome = e.kind;
        },
      );
      await tick();
      expect(outcome).toBe(expected);
      expect(cmd.settled).toBe(expected !== "pending");
    });
  }

  it("a pending command can still be settled by the caller", async () => {
    const decl = Command.async("u:late")
      .input(passthrough<void>())
      .output(passthrough<number>())
      .build();
    const commands = Commands.create();
    commands.listen(decl, () => {});
    const cmd = commands.call(decl, undefined);
    await tick();
    cmd.resolve(3);
    await expect(cmd.promise).resolves.toBe(3);
  });
});

describe("command lifecycle: claim is recorded when a listener resolves", () => {
  it("an async validator still running after the listener pass does not trip `not-claimed`", async () => {
    const calls = { n: 0 };
    const decl = Command.required("c:async")
      .input(passthrough<void>())
      .output(outputSchema("async", calls))
      .build();
    const commands = Commands.create();
    commands.listen(decl, () => {}, { priority: 1 });
    commands.listen(decl, (cmd) => {
      cmd.resolve(2);
    });
    commands.listen(decl, () => {}, { priority: -1 });
    await expect(commands.call(decl, undefined).promise).resolves.toBe(20);
  });

  it("first settlement wins while validation is in flight", async () => {
    const calls = { n: 0 };
    const decl = Command.silent("c:first")
      .input(passthrough<void>())
      .output(outputSchema("async", calls))
      .build();
    const cmd = Commands.create().call(decl, undefined);
    cmd.resolve(1);
    expect(cmd.settled).toBe(true);
    cmd.resolve(2);
    cmd.reject(new Error("late"));
    await expect(cmd.promise).resolves.toBe(10);
    expect(calls.n).toBe(1);
  });

  it("a listener promise that loses to a direct resolve is not validated", async () => {
    const calls = { n: 0 };
    const decl = Command.required("c:race")
      .input(passthrough<void>())
      .output(outputSchema("sync", calls))
      .build();
    const commands = Commands.create();
    commands.listen(decl, (cmd) => {
      cmd.resolve(1);
      return Promise.resolve(5);
    });
    await expect(commands.call(decl, undefined).promise).resolves.toBe(10);
    await tick();
    expect(calls.n).toBe(1);
  });
});

describe("command lifecycle: internal state is not visible on the command", () => {
  function dispatched(): DispatchedCommand<void, number> {
    const decl = Command.required("v")
      .input(passthrough<void>())
      .output(passthrough<number>())
      .build();
    const commands = Commands.create();
    commands.listen(decl, () => true);
    return commands.call(decl, undefined);
  }

  it("exposes only key, payload, settled, resolve, reject and promise", () => {
    const cmd = dispatched();
    const own = Object.getOwnPropertyNames(cmd).sort();
    expect(own).toEqual(["key", "payload", "promise", "reject", "resolve", "settled"]);
  });

  it("`settled` cannot be written from outside", async () => {
    const cmd = dispatched();
    cmd.resolve(1);
    const writable = cmd as unknown as { settled: boolean };
    expect(() => {
      writable.settled = false;
    }).toThrow(TypeError);
    expect(cmd.settled).toBe(true);
    cmd.resolve(2);
    await expect(cmd.promise).resolves.toBe(1);
  });
});
