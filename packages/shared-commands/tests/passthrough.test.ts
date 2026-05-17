import { describe, expect, it } from "vitest";
import { Command } from "../src/command.js";
import { passthrough } from "../src/passthrough.js";
import { Commands } from "../src/types.js";

describe("passthrough", () => {
  it("validates anything as-is (no transformation)", () => {
    const schema = passthrough<{ n: number }>();
    const result = schema["~standard"].validate({ n: 42 });
    expect(result).toEqual({ value: { n: 42 } });
  });

  it("returns the same singleton across calls (no allocation)", () => {
    const a = passthrough<string>();
    const b = passthrough<{ x: number }>();
    expect(a).toBe(b);
  });

  it("vendor identifies as 'passthrough'", () => {
    expect(passthrough()["~standard"].vendor).toBe("passthrough");
  });

  it("works as input/output schemas through the Commands bus", async () => {
    interface In {
      msg: string;
    }
    interface Out {
      ok: true;
    }
    const decl = Command.required("pt:test")
      .input(passthrough<In>())
      .output(passthrough<Out>())
      .build();

    const commands = new Commands();
    commands.listen(decl, () => Promise.resolve({ ok: true as const }));
    await expect(commands.call(decl, { msg: "hi" }).promise).resolves.toEqual({ ok: true });
  });
});
