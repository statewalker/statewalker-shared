import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { Command } from "./command.js";
import type { CommandDeclaration } from "./types.js";

function passthrough<T>(vendor = "test"): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor,
      validate(value): StandardSchemaV1.Result<T> {
        return { value: value as T };
      },
    },
  };
}

describe("Builder — declaration shape", () => {
  it(".build() returns a frozen declaration with all required fields", async () => {
    const decl = Command.required("b:1")
      .input(z.object({ a: z.string() }))
      .output(z.object({ b: z.number() }))
      .label("L")
      .description("D")
      .icon("I")
      .build();

    expect(decl.key).toBe("b:1");
    expect(decl.policy).toEqual({ onNoHandlers: "reject", onAllObserveOnly: "reject" });
    expect(decl.inputSchema).toBeDefined();
    expect(decl.outputSchema).toBeDefined();
    await expect(decl.inputJsonSchema).resolves.toMatchObject({ type: "object" });
    await expect(decl.outputJsonSchema).resolves.toMatchObject({ type: "object" });
    expect(decl.label).toBe("L");
    expect(decl.description).toBe("D");
    expect(decl.icon).toBe("I");
    expect(Object.isFrozen(decl)).toBe(true);
  });

  it("UX metadata defaults to undefined and round-trips when set", () => {
    const bare = Command.required("b:2").input(z.object({})).output(z.object({})).build();
    expect(bare.label).toBeUndefined();
    expect(bare.description).toBeUndefined();
    expect(bare.icon).toBeUndefined();

    const decorated = Command.required("b:3")
      .input(z.object({}))
      .output(z.object({}))
      .description("desc")
      .label("lab")
      .icon("ic")
      .build();
    expect(decorated).toMatchObject({ label: "lab", description: "desc", icon: "ic" });
  });

  it("UX setters chainable in any order", () => {
    const a = Command.required("b:4").input(z.object({})).output(z.object({}));
    const decl1 = a.label("a").description("b").icon("c").build();
    const decl2 = Command.required("b:5")
      .input(z.object({}))
      .output(z.object({}))
      .icon("c")
      .label("a")
      .description("b")
      .build();
    expect({ l: decl1.label, d: decl1.description, i: decl1.icon }).toEqual({
      l: "a",
      d: "b",
      i: "c",
    });
    expect({ l: decl2.label, d: decl2.description, i: decl2.icon }).toEqual({
      l: "a",
      d: "b",
      i: "c",
    });
  });

  it("setting label/description/icon twice throws", () => {
    expect(() =>
      Command.required("b:6")
        .input(z.object({}))
        .output(z.object({}))
        .label("a")
        .label("b")
        .build(),
    ).toThrow(/label already set/);
    expect(() =>
      Command.required("b:7")
        .input(z.object({}))
        .output(z.object({}))
        .description("a")
        .description("b")
        .build(),
    ).toThrow(/description already set/);
    expect(() =>
      Command.required("b:8").input(z.object({})).output(z.object({})).icon("a").icon("b").build(),
    ).toThrow(/icon already set/);
  });

  it("works with a hand-rolled Standard Schema (non-Zod path)", () => {
    interface Payload {
      n: number;
    }
    const decl = Command.required("b:9")
      .input(passthrough<Payload>())
      .output(passthrough<{ ok: true }>())
      .build();

    expect(decl.inputSchema["~standard"].vendor).toBe("test");
    expect(decl.outputSchema["~standard"].vendor).toBe("test");
  });

  it("Command.custom carries the custom policy through to the declaration", () => {
    const decl = Command.custom("b:10", { onNoHandlers: "wait", onAllObserveOnly: "reject" })
      .input(z.object({}))
      .output(z.object({}))
      .build();
    expect(decl.policy).toEqual({ onNoHandlers: "wait", onAllObserveOnly: "reject" });
  });
});

describe("Builder — type-level", () => {
  it(".build() is unavailable before .input and .output are set", () => {
    const partial = Command.required("t:1");
    // @ts-expect-error — .build() should not exist on PolicyChosen
    expectTypeOf(partial.build).toBeFunction();

    const withInput = partial.input(z.object({ a: z.string() }));
    // @ts-expect-error — .build() should not exist on InputSet
    expectTypeOf(withInput.build).toBeFunction();

    const withBoth = withInput.output(z.object({ b: z.number() }));
    expectTypeOf(withBoth.build).toBeFunction();

    expectTypeOf(withBoth.build()).toExtend<CommandDeclaration<{ a: string }, { b: number }>>();
  });
});
