import type { StandardSchemaV1 } from "@standard-schema/spec";
import { CommandError } from "./command-error.js";
import type { DispatchPolicy } from "./policy.js";

/**
 * A single dispatched command waiting to be settled.
 *
 * `resolve` / `reject` are settled-guarded: the first call wins, later
 * calls no-op. Listener claim state is internal to the bus — callers do
 * not observe it from the `Command` value.
 */
export interface Command<P, R> {
  readonly key: string;
  readonly payload: P;
  /** True once `resolve` or `reject` was called. Subsequent calls no-op. */
  settled: boolean;
  resolve(result: R): void;
  reject(error: unknown): void;
  readonly promise: Promise<R>;
}

/**
 * Listener signature for `Commands.listen`.
 *
 * - Return `true` → claim, do not settle yet (caller settles externally).
 * - Return `Promise<R>` → claim; the bus subscribes via `.then(resolve, reject)`.
 * - Return nothing → observe-only, no claim.
 *
 * Direct calls to `cmd.resolve` / `cmd.reject` from inside the listener
 * also claim and settle (the settled-guard ensures only the first wins).
 *
 * `void` in the union lets side-effect-only listener bodies typecheck
 * without an explicit `return undefined`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void enables side-effect-only listener bodies
export type CommandListener<P, R> = (cmd: Command<P, R>) => true | Promise<R> | void;

/**
 * Frozen carrier returned by the `Command.required` / `.async` /
 * `.silent` / `.custom` builder chain. Carries the string key, dispatch
 * policy, Standard Schemas (input/output) plus their derived JSON
 * Schemas, and optional UX metadata.
 */
export interface CommandDeclaration<P, R> {
  readonly key: string;
  readonly policy: DispatchPolicy;
  readonly inputSchema: StandardSchemaV1<P, P>;
  readonly outputSchema: StandardSchemaV1<R, R>;
  /**
   * Promise of the JSON Schema derived from `inputSchema` via
   * `@standard-community/standard-json`. The underlying bridge package
   * loads schema-vendor adapters via dynamic import, so derivation is
   * async-first. Consumers (AI tool projection, OpenAPI export) await
   * this when they need the JSON Schema shape.
   */
  readonly inputJsonSchema: Promise<Record<string, unknown>>;
  /** See `inputJsonSchema`. */
  readonly outputJsonSchema: Promise<Record<string, unknown>>;
  readonly label?: string;
  readonly description?: string;
  readonly icon?: string;
}

interface ListenerRecord {
  readonly fn: CommandListener<unknown, unknown>;
  readonly priority: number;
  readonly seq: number;
}

interface CommandInternal<P, R> extends Command<P, R> {
  claimed: boolean;
  observerRan: boolean;
}

function isThenable<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Cross-fragment command bus. One workspace = one bus (preserved
 * invariant from v1). The reference implementation can be constructed
 * via `new Commands()` for tests or via the canonical
 * `Commands.create()` static factory.
 */
export class Commands {
  private readonly _listeners = new Map<string, ListenerRecord[]>();
  private _seq = 0;

  /** Canonical factory. Returns a fresh, empty bus. */
  static create(): Commands {
    return new Commands();
  }

  /**
   * Type-only declarations of the optional `WorkspaceAdapter` lifecycle
   * hooks. `declare` keeps them out of the emitted JS — instances do
   * not actually carry these properties, so `adapter.init?.()` /
   * `adapter.close?.()` calls from the workspace no-op on `Commands`.
   */
  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  call<P, R>(decl: CommandDeclaration<P, R>, payload: P): Command<P, R> {
    const cmd = makeCommand<P, R>(decl, payload);

    const inputResult = decl.inputSchema["~standard"].validate(payload);
    if (isThenable(inputResult)) {
      inputResult.then(
        (r) => this._dispatchAfterInput(decl, cmd, r),
        (e) => cmd.reject(new CommandError("input-validation", { commandKey: decl.key, cause: e })),
      );
    } else {
      this._dispatchAfterInput(decl, cmd, inputResult);
    }

    return cmd;
  }

  listen<P, R>(
    decl: CommandDeclaration<P, R>,
    fn: CommandListener<P, R>,
    opts?: { priority?: number },
  ): () => void {
    const priority = opts?.priority ?? 0;
    let list = this._listeners.get(decl.key);
    if (!list) {
      list = [];
      this._listeners.set(decl.key, list);
    }
    const record: ListenerRecord = {
      fn: fn as CommandListener<unknown, unknown>,
      priority,
      seq: this._seq++,
    };
    list.push(record);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const current = this._listeners.get(decl.key);
      if (!current) return;
      const idx = current.indexOf(record);
      if (idx >= 0) current.splice(idx, 1);
      if (current.length === 0) this._listeners.delete(decl.key);
    };
  }

  private _dispatchAfterInput<P, R>(
    decl: CommandDeclaration<P, R>,
    cmd: CommandInternal<P, R>,
    result: StandardSchemaV1.Result<P>,
  ): void {
    if (result.issues) {
      cmd.reject(
        new CommandError("input-validation", { commandKey: decl.key, cause: result.issues }),
      );
      return;
    }
    if (cmd.settled) return;

    const list = this._listeners.get(decl.key);
    const snapshot = list ? [...list] : [];
    snapshot.sort((a, b) => b.priority - a.priority || a.seq - b.seq);

    const listenerCount = snapshot.length;

    for (const record of snapshot) {
      if (cmd.settled) break;
      const listener = record.fn as CommandListener<P, R>;
      // biome-ignore lint/suspicious/noConfusingVoidType: listener may legitimately return void (observe-only)
      let returned: true | Promise<R> | void;
      try {
        returned = listener(cmd);
      } catch (err) {
        cmd.reject(
          new CommandError("listener-threw", {
            commandKey: decl.key,
            cause: err,
            listener: record.fn,
          }),
        );
        return;
      }
      if (returned === true) {
        cmd.claimed = true;
      } else if (isThenable<R>(returned)) {
        cmd.claimed = true;
        returned.then(
          (value) => this._resolveWithOutputValidation(decl, cmd, value, record.fn),
          (err) =>
            cmd.reject(
              new CommandError("listener-threw", {
                commandKey: decl.key,
                cause: err,
                listener: record.fn,
              }),
            ),
        );
      } else {
        cmd.observerRan = true;
      }
    }

    if (cmd.settled || cmd.claimed) return;

    if (listenerCount === 0) {
      if (decl.policy.onNoHandlers === "reject") {
        cmd.reject(new CommandError("no-handlers", { commandKey: decl.key }));
      }
      return;
    }

    if (cmd.observerRan && !cmd.claimed) {
      if (decl.policy.onAllObserveOnly === "reject") {
        cmd.reject(new CommandError("not-claimed", { commandKey: decl.key }));
      }
    }
  }

  private _resolveWithOutputValidation<P, R>(
    decl: CommandDeclaration<P, R>,
    cmd: CommandInternal<P, R>,
    value: R,
    listener: CommandListener<unknown, unknown>,
  ): void {
    if (cmd.settled) return;
    const out = decl.outputSchema["~standard"].validate(value);
    if (isThenable(out)) {
      out.then(
        (r) => this._completeOutputValidation(decl, cmd, value, r, listener),
        (e) =>
          cmd.reject(
            new CommandError("output-validation", { commandKey: decl.key, cause: e, listener }),
          ),
      );
    } else {
      this._completeOutputValidation(decl, cmd, value, out, listener);
    }
  }

  private _completeOutputValidation<P, R>(
    decl: CommandDeclaration<P, R>,
    cmd: CommandInternal<P, R>,
    value: R,
    result: StandardSchemaV1.Result<R>,
    listener: CommandListener<unknown, unknown>,
  ): void {
    if (cmd.settled) return;
    if (result.issues) {
      cmd.reject(
        new CommandError("output-validation", {
          commandKey: decl.key,
          cause: result.issues,
          listener,
        }),
      );
      return;
    }
    cmd.resolve(value);
  }
}

function makeCommand<P, R>(decl: CommandDeclaration<P, R>, payload: P): CommandInternal<P, R> {
  let resolveFn!: (value: R | PromiseLike<R>) => void;
  let rejectFn!: (reason: unknown) => void;
  const promise = new Promise<R>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const cmd: CommandInternal<P, R> = {
    key: decl.key,
    payload,
    settled: false,
    claimed: false,
    observerRan: false,
    resolve(value: R) {
      if (cmd.settled) return;
      const out = decl.outputSchema["~standard"].validate(value);
      if (isThenable(out)) {
        out.then(
          (r) => completeManualResolve(decl, cmd, value, r, resolveFn, rejectFn),
          (e) => {
            if (cmd.settled) return;
            cmd.settled = true;
            rejectFn(new CommandError("output-validation", { commandKey: decl.key, cause: e }));
          },
        );
        return;
      }
      completeManualResolve(decl, cmd, value, out, resolveFn, rejectFn);
    },
    reject(error: unknown) {
      if (cmd.settled) return;
      cmd.settled = true;
      cmd.claimed = true;
      rejectFn(error);
    },
    promise,
  };
  return cmd;
}

function completeManualResolve<P, R>(
  decl: CommandDeclaration<P, R>,
  cmd: CommandInternal<P, R>,
  value: R,
  result: StandardSchemaV1.Result<R>,
  resolveFn: (value: R) => void,
  rejectFn: (reason: unknown) => void,
): void {
  if (cmd.settled) return;
  if (result.issues) {
    cmd.settled = true;
    rejectFn(new CommandError("output-validation", { commandKey: decl.key, cause: result.issues }));
    return;
  }
  cmd.settled = true;
  cmd.claimed = true;
  resolveFn(value);
}
