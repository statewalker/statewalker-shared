import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Command } from "./command.js";
import { CommandError } from "./command-error.js";
import { Commands } from "./types.js";

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

const Input = z.object({});
const Output = z.object({ y: z.string() });

describe("Policy — required", () => {
  const Req = Command.required("p:req").input(Input).output(Output).build();

  it("rejects no-handlers with zero listeners", async () => {
    const commands = new Commands();
    const cmd = commands.call(Req, {});
    await expect(cmd.promise).rejects.toMatchObject({ kind: "no-handlers", commandKey: "p:req" });
  });

  it("rejects not-claimed when only observers ran", async () => {
    const commands = new Commands();
    commands.listen(Req, () => {});
    commands.listen(Req, () => {});

    const cmd = commands.call(Req, {});
    await expect(cmd.promise).rejects.toMatchObject({ kind: "not-claimed", commandKey: "p:req" });
  });
});

describe("Policy — async", () => {
  const Async = Command.async("p:async").input(Input).output(Output).build();

  it("rejects no-handlers with zero listeners", async () => {
    const commands = new Commands();
    const cmd = commands.call(Async, {});
    await expect(cmd.promise).rejects.toMatchObject({ kind: "no-handlers" });
  });

  it("stays pending with observer-only listeners", async () => {
    const commands = new Commands();
    commands.listen(Async, () => {});

    const cmd = commands.call(Async, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);

    cmd.resolve({ y: "external" });
    await expect(cmd.promise).resolves.toEqual({ y: "external" });
  });
});

describe("Policy — silent", () => {
  const Silent = Command.silent("p:silent").input(Input).output(Output).build();

  it("stays pending with zero listeners", async () => {
    const commands = new Commands();
    const cmd = commands.call(Silent, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);
  });

  it("stays pending with observer-only listeners", async () => {
    const commands = new Commands();
    commands.listen(Silent, () => {});

    const cmd = commands.call(Silent, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);
  });
});

describe("Policy — custom (four combinations)", () => {
  it("onNoHandlers=reject, onAllObserveOnly=wait", async () => {
    const decl = Command.custom("p:c1", { onNoHandlers: "reject", onAllObserveOnly: "wait" })
      .input(Input)
      .output(Output)
      .build();
    const commands = new Commands();

    await expect(commands.call(decl, {}).promise).rejects.toBeInstanceOf(CommandError);

    commands.listen(decl, () => {});
    const cmd = commands.call(decl, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);
  });

  it("onNoHandlers=wait, onAllObserveOnly=reject", async () => {
    const decl = Command.custom("p:c2", { onNoHandlers: "wait", onAllObserveOnly: "reject" })
      .input(Input)
      .output(Output)
      .build();
    const commands = new Commands();

    const cmd = commands.call(decl, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);

    const commands2 = new Commands();
    commands2.listen(decl, () => {});
    await expect(commands2.call(decl, {}).promise).rejects.toMatchObject({ kind: "not-claimed" });
  });

  it("onNoHandlers=wait, onAllObserveOnly=wait (equivalent to silent)", async () => {
    const decl = Command.custom("p:c3", { onNoHandlers: "wait", onAllObserveOnly: "wait" })
      .input(Input)
      .output(Output)
      .build();
    const commands = new Commands();
    const cmd = commands.call(decl, {});
    let settled = false;
    cmd.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await drainMicrotasks();
    expect(settled).toBe(false);
  });

  it("onNoHandlers=reject, onAllObserveOnly=reject (equivalent to required)", async () => {
    const decl = Command.custom("p:c4", { onNoHandlers: "reject", onAllObserveOnly: "reject" })
      .input(Input)
      .output(Output)
      .build();
    const commands = new Commands();
    await expect(commands.call(decl, {}).promise).rejects.toMatchObject({ kind: "no-handlers" });

    const commands2 = new Commands();
    commands2.listen(decl, () => {});
    await expect(commands2.call(decl, {}).promise).rejects.toMatchObject({ kind: "not-claimed" });
  });
});
