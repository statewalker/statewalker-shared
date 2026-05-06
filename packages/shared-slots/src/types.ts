/**
 * Cross-fragment extension-point bus. The invariant — enforced by the
 * workspace-centric architecture — is **one workspace = one bus**: callers
 * obtain the instance via `workspace.requireAdapter(Slots)` (auto-instantiated
 * on first lookup). Constructing a bus directly with `new Slots()` is
 * supported for tests, but production code paths share a single
 * workspace-scoped instance so that contributions made by one fragment are
 * observable by every other fragment in the same composition.
 *
 * Mirrors the `Intents` class shape from `@statewalker/shared-intents`.
 *
 * Slots store contributions in a `Set` keyed by reference identity:
 * providing the same object twice yields one entry; two structurally-equal
 * but distinct objects yield two entries. Callers that need
 * identity-by-data are responsible for deduping at provision time.
 */
export class Slots {
  private readonly _values = new Map<string, Set<unknown>>();
  private readonly _watchers = new Map<string, Set<(values: unknown[]) => void>>();
  private readonly _snapshots = new Map<string, readonly unknown[]>();

  /**
   * Type-only declarations of the optional `WorkspaceAdapter` lifecycle hooks.
   * Same trick as `Intents` — kept out of the emitted JS so the workspace's
   * `adapter.init?.()` / `adapter.close?.()` calls no-op. The declarations
   * exist purely so TypeScript sees the class as structurally compatible
   * with `WorkspaceAdapter` without `shared-slots` having to import it.
   */
  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  /**
   * Contribute a value into the slot identified by `key`. Returns a disposer.
   * Notifies live observers synchronously after the value is added (or
   * removed, on dispose). Reference-deduped: providing the same object twice
   * is a no-op for the second call but still returns a working disposer.
   */
  provide<T>(key: string, value: T): () => void {
    let bag = this._values.get(key);
    if (!bag) {
      bag = new Set();
      this._values.set(key, bag);
    }
    const wasNew = !bag.has(value);
    bag.add(value);
    if (wasNew) {
      this._snapshots.delete(key);
      this._notify(key);
    }

    return () => {
      const b = this._values.get(key);
      if (!b) return;
      const removed = b.delete(value);
      if (b.size === 0) this._values.delete(key);
      if (removed) {
        this._snapshots.delete(key);
        this._notify(key);
      }
    };
  }

  /**
   * Subscribe to changes in the slot identified by `key`. The callback is
   * invoked synchronously **once** with the current snapshot before
   * `observe` returns, then again synchronously on every `provide` /
   * disposer for that key. Returns a disposer that removes the observer.
   */
  observe<T>(key: string, cb: (values: T[]) => void): () => void {
    let watchers = this._watchers.get(key);
    if (!watchers) {
      watchers = new Set();
      this._watchers.set(key, watchers);
    }
    const w = cb as (values: unknown[]) => void;
    watchers.add(w);
    try {
      cb(Array.from(this._values.get(key) ?? []) as T[]);
    } catch (error) {
      console.error(error);
    }

    return () => {
      const ws = this._watchers.get(key);
      if (!ws) return;
      ws.delete(w);
      if (ws.size === 0) this._watchers.delete(key);
    };
  }

  /**
   * Read the current array of values for `key` without subscribing. The
   * returned reference is stable until the next `provide` / disposer call
   * for `key` — required by `useSyncExternalStore` consumers, which loop
   * if the snapshot reference changes between calls without an intervening
   * mutation.
   */
  getSnapshot<T>(key: string): readonly T[] {
    let snap = this._snapshots.get(key);
    if (!snap) {
      snap = Object.freeze(Array.from(this._values.get(key) ?? []));
      this._snapshots.set(key, snap);
    }
    return snap as readonly T[];
  }

  private _notify(key: string): void {
    const watchers = this._watchers.get(key);
    if (!watchers) return;
    const snapshot = Array.from(this._values.get(key) ?? []);
    for (const cb of watchers) {
      try {
        cb(snapshot);
      } catch (error) {
        console.error(error);
      }
    }
  }
}
