/**
 * A single dispatched command waiting to be settled.
 *
 * Three-state lifecycle: `pending` (no listener has claimed yet) →
 * `handled` (a listener claimed via `return true`, returning a `Promise`,
 * or calling `resolve`/`reject`) → `settled` (`resolve` or `reject` was
 * called).
 */
export interface Command<P, R> {
  readonly key: string;
  readonly payload: P;
  /** True once any listener (or a returned `Promise`) claimed the command. */
  handled: boolean;
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
 * - Return nothing (no `return` statement) → observe-only, no claim.
 *
 * Direct calls to `cmd.resolve` / `cmd.reject` from inside the listener
 * also claim and settle (the settled-guard ensures only the first wins).
 *
 * `void` in the union is load-bearing — it lets side-effect-only
 * listener bodies (`(cmd) => { doThing(cmd); }`) typecheck without an
 * explicit `return undefined`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void enables side-effect-only listener bodies
export type CommandListener<P, R> = (cmd: Command<P, R>) => true | Promise<R> | void;

/**
 * Per-declaration default fallback. Runs after the listener pass iff
 * no listener claimed. May return a value (bus resolves), return a
 * promise (bus awaits), throw (bus rejects), call `cmd.resolve` /
 * `cmd.reject` directly, or return nothing to leave the command
 * pending (caller resolves externally — the silent-pending opt-in).
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void enables side-effect-only default bodies
export type CommandDefault<P, R> = (cmd: Command<P, R>) => R | Promise<R> | void;

/**
 * Frozen carrier returned by `defineCommand`. Carries the string key,
 * the payload/result types, and the optional fallback. Pass to
 * `commands.call` / `commands.listen` instead of the raw key.
 */
export interface CommandDeclaration<P, R> {
  readonly key: string;
  readonly defaultFn?: CommandDefault<P, R>;
}

/**
 * Cross-fragment command bus. The invariant — enforced by the
 * workspace-centric architecture — is **one workspace = one bus**:
 * callers obtain the instance via `workspace.requireAdapter(Commands)`
 * (auto-instantiated on first lookup) or through the `getCommands(ctx)`
 * shim, which delegates to the same workspace.
 *
 * Constructing a bus directly with `new Commands()` is supported for
 * tests, but production code paths share a single workspace-scoped
 * instance so that listeners registered by one fragment are observable
 * by every other fragment in the same composition.
 */
export class Commands {
  private readonly _listeners = new Map<string, Set<CommandListener<unknown, unknown>>>();

  /**
   * Type-only declarations of the optional `WorkspaceAdapter` lifecycle
   * hooks. `declare` keeps them out of the emitted JS — instances do
   * not actually carry these properties, so `adapter.init?.()` /
   * `adapter.close?.()` calls from the workspace no-op on `Commands`.
   * Keeps the substrate from depending on `@statewalker/workspace`.
   */
  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  call<P, R>(decl: CommandDeclaration<P, R>, payload: P): Command<P, R> {
    let resolveFn!: (result: R) => void;
    let rejectFn!: (error: unknown) => void;

    const promise = new Promise<R>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const cmd: Command<P, R> = {
      key: decl.key,
      payload,
      handled: false,
      settled: false,
      resolve(result: R) {
        if (cmd.settled) return;
        cmd.settled = true;
        cmd.handled = true;
        resolveFn(result);
      },
      reject(error: unknown) {
        if (cmd.settled) return;
        cmd.settled = true;
        cmd.handled = true;
        rejectFn(error);
      },
      promise,
    };

    const listeners = this._listeners.get(decl.key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          const result = (listener as CommandListener<P, R>)(cmd);
          if (result === true) {
            cmd.handled = true;
          } else if (result && typeof (result as Promise<R>).then === "function") {
            cmd.handled = true;
            (result as Promise<R>).then(
              (value) => cmd.resolve(value),
              (err) => cmd.reject(err),
            );
          }
          // void / undefined → observe-only.
          // A listener that synchronously called cmd.resolve / cmd.reject
          // already set cmd.handled = true via the resolve/reject methods.
        } catch (err) {
          // A listener that throws is treated as a claim that rejects.
          cmd.reject(err);
        }
      }
    }

    if (!cmd.handled) {
      if (decl.defaultFn) {
        try {
          const fallback = decl.defaultFn(cmd);
          if (fallback && typeof (fallback as Promise<R>).then === "function") {
            cmd.handled = true;
            (fallback as Promise<R>).then(
              (value) => cmd.resolve(value),
              (err) => cmd.reject(err),
            );
          } else if (fallback !== undefined) {
            cmd.resolve(fallback as R);
          } else {
            // void return — leave the command pending. Caller is
            // responsible for settling externally (e.g. timeout).
            cmd.handled = true;
          }
        } catch (err) {
          cmd.reject(err);
        }
      } else {
        cmd.reject(new Error(`Unhandled command: ${decl.key}`));
      }
    }

    return cmd;
  }

  listen<P, R>(decl: CommandDeclaration<P, R>, fn: CommandListener<P, R>): () => void {
    let set = this._listeners.get(decl.key);
    if (!set) {
      set = new Set();
      this._listeners.set(decl.key, set);
    }
    const f = fn as CommandListener<unknown, unknown>;
    set.add(f);

    return () => {
      const s = this._listeners.get(decl.key);
      if (s) {
        s.delete(f);
        if (s.size === 0) this._listeners.delete(decl.key);
      }
    };
  }
}
