export interface Intent<P, R> {
  key: string;
  payload: P;
  handled: boolean;
  settled: boolean;
  resolve(result: R): void;
  reject(error: unknown): void;
  promise: Promise<R>;
}

export type IntentHandler<P = unknown, R = unknown> = (intent: Intent<P, R>) => boolean;

/**
 * Cross-fragment dispatch bus. The invariant — enforced by the workspace-centric
 * architecture — is **one workspace = one bus**: callers obtain the instance via
 * `workspace.requireAdapter(Intents)` (auto-instantiated on first lookup) or
 * through the `getIntents(ctx)` shim, which delegates to the same workspace.
 * Constructing a bus directly with `new Intents()` is supported for tests and
 * for the `createIntents()` factory shim, but production code paths share a
 * single workspace-scoped instance so that handlers registered by one fragment
 * are observable by every other fragment in the same composition.
 */
export class Intents {
  private readonly _handlers = new Map<string, Set<IntentHandler>>();

  /**
   * Type-only declarations of the optional `WorkspaceAdapter` lifecycle hooks.
   * `declare` keeps them out of the emitted JS — instances do not actually
   * carry these properties, so `adapter.init?.()` / `adapter.close?.()` calls
   * from the workspace no-op on `Intents`. The declarations exist purely so
   * TypeScript's weak-type detection sees the class as structurally
   * compatible with `WorkspaceAdapter` without `shared-intents` having to
   * import it (which would create a substrate→workspace dependency cycle).
   */
  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  run<P, R>(key: string, payload: P, defaultHandler?: IntentHandler<P, R>): Intent<P, R> {
    let resolveFn!: (result: R) => void;
    let rejectFn!: (error: unknown) => void;

    const promise = new Promise<R>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const intent: Intent<P, R> = {
      key,
      payload,
      handled: false,
      settled: false,
      resolve(result: R) {
        if (intent.settled) return;
        intent.settled = true;
        resolveFn(result);
      },
      reject(error: unknown) {
        if (intent.settled) return;
        intent.settled = true;
        rejectFn(error);
      },
      promise,
    };

    const keyHandlers = this._handlers.get(key);
    if (keyHandlers) {
      for (const handler of keyHandlers) {
        const claimed = (handler as IntentHandler<P, R>)(intent);
        if (claimed) {
          intent.handled = true;
          break;
        }
      }
    }

    if (!intent.handled) {
      defaultHandler?.(intent);
      intent.handled = true;
    }

    return intent;
  }

  addHandler<P, R>(key: string, handler: IntentHandler<P, R>): () => void {
    let set = this._handlers.get(key);
    if (!set) {
      set = new Set();
      this._handlers.set(key, set);
    }
    const h = handler as IntentHandler;
    set.add(h);

    return () => {
      const s = this._handlers.get(key);
      if (s) {
        s.delete(h);
        if (s.size === 0) this._handlers.delete(key);
      }
    };
  }
}
