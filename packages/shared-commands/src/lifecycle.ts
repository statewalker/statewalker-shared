import type { StandardSchemaV1 } from "@standard-schema/spec";
import { CommandError } from "./command-error.js";
import type { Command, CommandDeclaration, CommandListener } from "./types.js";

/**
 * The lifecycle of one dispatched command. Internal to the bus: callers see
 * only the {@link Command} value, whose `settled` reads `validating` or
 * `settled`.
 *
 * - `pending`: input validation or the listener pass is running, or no
 *   listener claimed the command and the policy says wait.
 * - `claimed`: a listener returned `true` or a promise; nothing settled yet.
 *   The claim ends the listener pass: lower-priority listeners do not run.
 * - `validating`: the first `resolve` arrived (from a listener, its promise
 *   or the caller) and the output schema is running. The command counts as
 *   claimed from here on, and later `resolve` / `reject` calls are ignored.
 * - `settled`: the promise is resolved or rejected.
 */
type State = "pending" | "claimed" | "validating" | "settled";

/** A registered listener, as the bus hands it to a dispatch. */
export interface DispatchListener {
  readonly fn: CommandListener<unknown, unknown>;
}

function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Validates `value` with `schema` and calls back once, synchronously when
 * the schema is synchronous. A throwing or rejecting validator is reported
 * through `onError`, never thrown.
 */
function validate<T>(
  schema: StandardSchemaV1<T, T>,
  value: unknown,
  onResult: (result: StandardSchemaV1.Result<T>) => void,
  onError: (cause: unknown) => void,
): void {
  let result: StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>;
  try {
    result = schema["~standard"].validate(value);
  } catch (e) {
    onError(e);
    return;
  }
  if (isThenable<StandardSchemaV1.Result<T>>(result)) result.then(onResult, onError);
  else onResult(result);
}

/**
 * Dispatch one command: validate the input, run the listeners returned by
 * `listeners()` (already ordered) until one claims or settles it, apply the
 * declaration's policy, and
 * settle through output validation. Every settlement route (a listener's
 * direct `resolve` / `reject`, its returned promise, its throw, the
 * caller's `resolve` / `reject` after a `true` claim, the caller's `signal`)
 * goes through the one state machine below.
 */
export function dispatchCommand<P, R>(
  decl: CommandDeclaration<P, R>,
  payload: P,
  listeners: () => readonly DispatchListener[],
  signal?: AbortSignal,
): Command<P, R> {
  let state: State = "pending";
  let observed = false;
  let currentPayload = payload;

  let resolvePromise!: (value: R) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<R>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const decided = () => state === "validating" || state === "settled";

  let onAbort: (() => void) | undefined;
  const settle = () => {
    state = "settled";
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  };

  const fail = (error: unknown) => {
    settle();
    rejectPromise(error);
  };

  const reject = (error: unknown) => {
    if (decided()) return;
    fail(error);
  };

  const resolve = (value: R, listener?: CommandListener<unknown, unknown>) => {
    if (decided()) return;
    state = "validating";
    const outputError = (cause: unknown) =>
      fail(
        new CommandError("output-validation", {
          commandKey: decl.key,
          cause,
          ...(listener ? { listener } : {}),
        }),
      );
    validate(
      decl.outputSchema,
      value,
      (result) => {
        if (result.issues) return outputError(result.issues);
        settle();
        resolvePromise(result.value);
      },
      outputError,
    );
  };

  const listenerThrew = (cause: unknown, listener: CommandListener<unknown, unknown>) =>
    reject(new CommandError("listener-threw", { commandKey: decl.key, cause, listener }));

  const command = Object.freeze(
    Object.defineProperties({} as Command<P, R>, {
      key: { value: decl.key, enumerable: true },
      payload: { get: () => currentPayload, enumerable: true },
      // Only when the caller gave one, so a call without options keeps its shape.
      ...(signal ? { signal: { value: signal, enumerable: true } } : {}),
      settled: { get: decided, enumerable: true },
      resolve: { value: (value: R) => resolve(value), enumerable: true },
      reject: { value: reject, enumerable: true },
      promise: { value: promise, enumerable: true },
    }),
  );

  const runListeners = () => {
    const list = listeners();
    for (const { fn } of list) {
      if (decided()) return;
      const listener = fn as CommandListener<P, R>;
      // biome-ignore lint/suspicious/noConfusingVoidType: listener may legitimately return void (observe-only)
      let returned: true | Promise<R> | void;
      try {
        returned = listener(command);
      } catch (err) {
        listenerThrew(err, fn);
        return;
      }
      // A claim (`true` or a promise) short-circuits the dispatch: the
      // lower-priority listeners do not run (#60).
      if (returned === true) {
        if (state === "pending") state = "claimed";
        return;
      }
      if (isThenable<R>(returned)) {
        if (state === "pending") state = "claimed";
        returned.then(
          (value) => resolve(value, fn),
          (err) => listenerThrew(err, fn),
        );
        return;
      }
      observed = true;
    }
    if (state !== "pending") return;
    if (list.length === 0) {
      if (decl.policy.onNoHandlers === "reject") {
        fail(new CommandError("no-handlers", { commandKey: decl.key }));
      }
    } else if (observed && decl.policy.onAllObserveOnly === "reject") {
      fail(new CommandError("not-claimed", { commandKey: decl.key }));
    }
  };

  if (signal) {
    const aborted = () =>
      reject(new CommandError("aborted", { commandKey: decl.key, cause: signal.reason }));
    if (signal.aborted) {
      aborted();
      return command;
    }
    onAbort = aborted;
    signal.addEventListener("abort", onAbort, { once: true });
  }

  const inputError = (cause: unknown) =>
    reject(new CommandError("input-validation", { commandKey: decl.key, cause }));
  validate(
    decl.inputSchema,
    payload,
    (result) => {
      if (result.issues) return inputError(result.issues);
      if (decided()) return;
      // Listeners see the validated value: schema defaults, coercions and
      // transforms apply, matching the declaration's payload type.
      currentPayload = result.value;
      runListeners();
    },
    inputError,
  );

  return command;
}
