import type { CommandListener } from "./types.js";

export type CommandErrorKind =
  | "input-validation"
  | "no-handlers"
  | "not-claimed"
  | "listener-threw"
  | "output-validation";

export interface CommandErrorOptions {
  readonly commandKey: string;
  readonly cause?: unknown;
  readonly listener?: CommandListener<unknown, unknown>;
}

/**
 * Single discriminated error class for every bus-level dispatch failure.
 *
 * Discriminate by `kind`:
 *
 * - `"input-validation"` — payload failed `decl.inputSchema`. `cause` is the validator's failure.
 * - `"no-handlers"` — policy `required` / `async` rejected because zero listeners are registered.
 * - `"not-claimed"` — policy `required` rejected because every listener returned `void`.
 * - `"listener-threw"` — a listener threw or returned a rejecting promise. `cause` is the thrown value / rejection reason; `listener` is the offending function.
 * - `"output-validation"` — a listener resolved with a value that failed `decl.outputSchema`. `cause` is the validator's failure; `listener` is the offending function.
 *
 * Pending-forever (silent policy with no claimer) is NOT a `CommandError`.
 */
export class CommandError extends Error {
  readonly kind: CommandErrorKind;
  readonly commandKey: string;
  readonly listener?: CommandListener<unknown, unknown>;

  constructor(kind: CommandErrorKind, opts: CommandErrorOptions) {
    super(
      `${kind}: ${opts.commandKey}`,
      opts.cause !== undefined ? { cause: opts.cause } : undefined,
    );
    this.name = "CommandError";
    this.kind = kind;
    this.commandKey = opts.commandKey;
    this.listener = opts.listener;
  }
}
