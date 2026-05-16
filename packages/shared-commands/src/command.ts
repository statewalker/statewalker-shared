import { createBuilder, type PolicyChosen } from "./builder.js";
import { ASYNC, type DispatchPolicy, REQUIRED, SILENT } from "./policy.js";
import type { Command as DispatchedCommand } from "./types.js";

/**
 * Re-export of the dispatched-command interface under the merged
 * identifier. `Command<P, R>` is the type; `Command` (below) is the
 * builder namespace value. TypeScript distinguishes by position.
 */
export type Command<P, R> = DispatchedCommand<P, R>;

/**
 * `Command` namespace value. Entry points to the declaration builder.
 *
 * Each entry pre-selects a dispatch policy. Chain `.input(schema)` then
 * `.output(schema)` (any Standard Schema validator) and optionally
 * `.label / .description / .icon`, then `.build()` to produce a frozen
 * `CommandDeclaration<P, R>`.
 *
 * The `Command` value coexists with the `Command<P, R>` interface (the
 * dispatched-command shape) — TypeScript distinguishes by position.
 */
export const Command = {
  /** Reject on no-handlers AND observers-only. */
  required(key: string): PolicyChosen {
    return createBuilder(key, REQUIRED);
  },
  /** Reject on no-handlers; wait on observers-only. */
  async(key: string): PolicyChosen {
    return createBuilder(key, ASYNC);
  },
  /** Wait on both no-handlers and observers-only. */
  silent(key: string): PolicyChosen {
    return createBuilder(key, SILENT);
  },
  /** Custom per-field policy. */
  custom(key: string, policy: DispatchPolicy): PolicyChosen {
    return createBuilder(key, Object.freeze({ ...policy }));
  },
} as const;
