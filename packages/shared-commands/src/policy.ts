/**
 * Dispatch policy on a {@link CommandDeclaration}. The two fields are
 * applied after the listener pass if no listener claimed the command:
 *
 * - `onNoHandlers`: applied iff zero listeners ran (no registrations).
 * - `onAllObserveOnly`: applied iff at least one listener ran but none
 *   claimed (every listener returned `void`).
 *
 * `"reject"` rejects the command's promise with a `CommandError` whose
 * `kind` is `"no-handlers"` or `"not-claimed"`. `"wait"` leaves the
 * command pending — the caller settles externally, or the promise stays
 * unresolved.
 */
export interface DispatchPolicy {
  readonly onNoHandlers: "reject" | "wait";
  readonly onAllObserveOnly: "reject" | "wait";
}

/** Loud-fail on no-handlers and observers-only. */
export const REQUIRED: DispatchPolicy = Object.freeze({
  onNoHandlers: "reject",
  onAllObserveOnly: "reject",
});

/** Loud-fail on no-handlers; wait if observers-only ran. */
export const ASYNC: DispatchPolicy = Object.freeze({
  onNoHandlers: "reject",
  onAllObserveOnly: "wait",
});

/** Wait on both. */
export const SILENT: DispatchPolicy = Object.freeze({
  onNoHandlers: "wait",
  onAllObserveOnly: "wait",
});
