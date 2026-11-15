import type { StandardSchemaV1 } from "@standard-schema/spec";
import { dispatchCommand } from "./lifecycle.js";
import type { DispatchPolicy } from "./policy.js";

/**
 * A single dispatched command waiting to be settled.
 *
 * `resolve` / `reject` are settled-guarded: the first call wins, later
 * calls no-op — also while an async output schema is still validating the
 * first `resolve`. The command's lifecycle (pending, claimed, validating,
 * settled) is internal to the bus: callers see only `settled`.
 *
 * `payload` is the value returned by `decl.inputSchema` (defaults,
 * coercions and transforms applied), and `promise` resolves with the value
 * returned by `decl.outputSchema` for the first `resolve`.
 */
export interface Command<P, R> {
  readonly key: string;
  readonly payload: P;
  /**
   * True once the command is decided: `resolve` or `reject` was called (by a
   * listener, a listener's promise, the policy or the caller). Later calls
   * no-op. Read-only.
   */
  readonly settled: boolean;
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
    return dispatchCommand(decl, payload, () => {
      const list = this._listeners.get(decl.key);
      const snapshot = list ? [...list] : [];
      return snapshot.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    });
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
}
