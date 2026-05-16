import { describe, expect, expectTypeOf, it } from "vitest";
import { CommandError } from "./command-error.js";
import type { CommandListener } from "./types.js";

describe("CommandError", () => {
  it("is both Error and CommandError instance", () => {
    const e = new CommandError("input-validation", { commandKey: "k" });
    expect(e).toBeInstanceOf(CommandError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CommandError");
  });

  it("kind matches the constructor arg", () => {
    expect(new CommandError("input-validation", { commandKey: "k" }).kind).toBe("input-validation");
    expect(new CommandError("no-handlers", { commandKey: "k" }).kind).toBe("no-handlers");
    expect(new CommandError("not-claimed", { commandKey: "k" }).kind).toBe("not-claimed");
    expect(new CommandError("listener-threw", { commandKey: "k" }).kind).toBe("listener-threw");
    expect(new CommandError("output-validation", { commandKey: "k" }).kind).toBe(
      "output-validation",
    );
  });

  it("carries commandKey, cause, and listener through", () => {
    const listener: CommandListener<unknown, unknown> = () => {};
    const cause = new Error("inner");
    const e = new CommandError("listener-threw", { commandKey: "x:y", cause, listener });
    expect(e.commandKey).toBe("x:y");
    expect(e.cause).toBe(cause);
    expect(e.listener).toBe(listener);
  });

  it("switch on kind narrows to expected payload at the type level", () => {
    const e = new CommandError("input-validation", { commandKey: "k" });
    switch (e.kind) {
      case "input-validation":
      case "no-handlers":
      case "not-claimed":
      case "listener-threw":
      case "output-validation":
        expectTypeOf(e.kind).toEqualTypeOf<
          | "input-validation"
          | "no-handlers"
          | "not-claimed"
          | "listener-threw"
          | "output-validation"
        >();
        break;
    }
  });
});
