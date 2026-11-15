import { describe, expect, it, vi } from "vitest";
import { Command } from "../src/command.js";
import { passthrough } from "../src/passthrough.js";
import { CommandsRegistry } from "../src/registry.js";

// The commands registry builds on the shared Notifier (#41).
const decl = (key: string) =>
  Command.required(key).input(passthrough<void>()).output(passthrough<void>()).build();

describe("CommandsRegistry notification rules", () => {
  it("a throwing subscriber does not stop the others; the error reaches the caller after the pass", () => {
    const reg = CommandsRegistry.create();
    const after = vi.fn();
    const boom = new Error("boom");
    reg.onUpdate(() => {
      throw boom;
    });
    reg.onUpdate(after);
    expect(() => reg.set(decl("a"))).toThrow(boom);
    expect(after).toHaveBeenCalledOnce();
    expect(reg.get("a")).toBeDefined();
  });

  it("a stale disposer does not remove a later subscription of the same function", () => {
    const reg = CommandsRegistry.create();
    const fn = vi.fn();
    const off = reg.onUpdate(fn);
    off();
    reg.onUpdate(fn);
    off();
    reg.set(decl("a"));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("subscribing the same function twice notifies it once", () => {
    const reg = CommandsRegistry.create();
    const fn = vi.fn();
    reg.onUpdate(fn);
    reg.onUpdate(fn);
    reg.set(decl("a"));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("a subscriber added during a notification is called from the next one", () => {
    const reg = CommandsRegistry.create();
    const late = vi.fn();
    reg.onUpdate(() => {
      reg.onUpdate(late);
    });
    reg.set(decl("a"));
    expect(late).not.toHaveBeenCalled();
    reg.set(decl("b"));
    expect(late).toHaveBeenCalledOnce();
  });
});
