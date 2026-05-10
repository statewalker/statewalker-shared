/**
 * Cross-fragment extension-point bus. The invariant — enforced by the
 * workspace-centric architecture — is **one workspace = one bus**:
 * callers obtain the instance via `workspace.requireAdapter(Slots)`
 * (auto-instantiated on first lookup). Constructing a bus directly with
 * `new Slots()` is supported for tests, but production code paths share
 * a single workspace-scoped instance so that contributions made by one
 * fragment are observable by every other fragment in the same
 * composition.
 *
 * Two declaration kinds are supported, distinguished by their `_kind`
 * brand:
 *
 *  - **Plain slot** (`SlotDeclaration<T>`, made via `defineSlot<T>(key)`):
 *    append-only set of values; ref-deduped (providing the same object
 *    twice is a no-op for the second call). Operations: `provide`,
 *    `observe`, `getSnapshot`.
 *
 *  - **Keyed slot** (`KeyedSlotDeclaration<T>`, made via
 *    `defineKeyedSlot<T>(key)`): id-keyed map of values; collision-throws
 *    on duplicate ids with different values; ref-counted no-op on
 *    same-reference re-register. Operations: `register`, `get`, `observe`.
 *
 * The two namespaces share a key-string space — a key used for one kind
 * is conceptually distinct from the same string used for the other.
 * Internally the bus stores them in separate maps. By convention each
 * key string is owned by exactly one declaration in the codebase.
 */

import type { KeyedSlotDeclaration, SlotDeclaration } from "./define-slot.js";

interface KeyedEntry<T> {
  readonly value: T;
  refCount: number;
}

export class Slots {
  // Plain-slot storage.
  private readonly _plainValues = new Map<string, Set<unknown>>();
  private readonly _plainWatchers = new Map<string, Set<(values: unknown[]) => void>>();
  private readonly _plainSnapshots = new Map<string, readonly unknown[]>();

  // Keyed-slot storage. The bus owns the index and version counter
  // per key, shared across all consumers of the same keyed slot.
  private readonly _keyedEntries = new Map<string, Map<string, KeyedEntry<unknown>>>();
  private readonly _keyedWatchers = new Map<string, Set<(entries: ReadonlyMap<string, unknown>) => void>>();
  private readonly _keyedSnapshots = new Map<string, ReadonlyMap<string, unknown>>();

  /**
   * Type-only declarations of the optional `WorkspaceAdapter` lifecycle
   * hooks. Same trick as `Commands` — kept out of the emitted JS so the
   * workspace's `adapter.init?.()` / `adapter.close?.()` calls no-op.
   */
  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  // === Plain slots ===

  /**
   * Contribute a value into the plain slot. Returns a disposer.
   * Reference-deduped: providing the same object twice is a no-op for
   * the second call but still returns a working disposer.
   */
  provide<T>(decl: SlotDeclaration<T>, value: T): () => void {
    const key = decl.key;
    let bag = this._plainValues.get(key);
    if (!bag) {
      bag = new Set();
      this._plainValues.set(key, bag);
    }
    const wasNew = !bag.has(value);
    bag.add(value);
    if (wasNew) {
      this._plainSnapshots.delete(key);
      this._notifyPlain(key);
    }

    return () => {
      const b = this._plainValues.get(key);
      if (!b) return;
      const removed = b.delete(value);
      if (b.size === 0) this._plainValues.delete(key);
      if (removed) {
        this._plainSnapshots.delete(key);
        this._notifyPlain(key);
      }
    };
  }

  /**
   * Read the current contributions for a slot without subscribing.
   *
   * Plain decl → returns a frozen `readonly T[]` (insertion order).
   * Keyed decl → returns a `ReadonlyMap<string, T>` (registration order).
   *
   * The returned reference is stable until the next mutation for
   * `decl.key` — required by `useSyncExternalStore` consumers, which
   * loop if the snapshot reference changes between calls without an
   * intervening mutation.
   */
  getSnapshot<T>(decl: SlotDeclaration<T>): readonly T[];
  getSnapshot<T>(decl: KeyedSlotDeclaration<T>): ReadonlyMap<string, T>;
  getSnapshot<T>(
    decl: SlotDeclaration<T> | KeyedSlotDeclaration<T>,
  ): readonly T[] | ReadonlyMap<string, T> {
    if (decl._kind === "plain") {
      const key = decl.key;
      let snap = this._plainSnapshots.get(key);
      if (!snap) {
        snap = Object.freeze(Array.from(this._plainValues.get(key) ?? []));
        this._plainSnapshots.set(key, snap);
      }
      return snap as readonly T[];
    }
    return this._snapshotKeyed(decl.key) as ReadonlyMap<string, T>;
  }

  // === Keyed slots ===

  /**
   * Register a value under `id` in a keyed slot. Returns a disposer.
   *
   * Re-registering the exact same value reference under the same id
   * is ref-counted (the entry survives until every disposer fires).
   * Registering a different value under an existing id throws
   * `RangeError`.
   */
  register<T>(decl: KeyedSlotDeclaration<T>, id: string, value: T): () => void {
    const key = decl.key;
    let entries = this._keyedEntries.get(key);
    if (!entries) {
      entries = new Map();
      this._keyedEntries.set(key, entries);
    }

    const existing = entries.get(id);
    if (existing) {
      if (!Object.is(existing.value, value)) {
        throw new RangeError(
          `Slots.register: id "${id}" is already registered with a different value (slotKey="${key}")`,
        );
      }
      existing.refCount += 1;
      return () => this._releaseKeyed(key, id);
    }

    entries.set(id, { value, refCount: 1 });
    this._keyedSnapshots.delete(key);
    this._notifyKeyed(key);

    return () => this._releaseKeyed(key, id);
  }

  /**
   * O(1) lookup of the value previously registered under `id`. Returns
   * `null` for unknown ids.
   */
  get<T>(decl: KeyedSlotDeclaration<T>, id: string): T | null {
    const entries = this._keyedEntries.get(decl.key);
    if (!entries) return null;
    const entry = entries.get(id);
    return entry ? (entry.value as T) : null;
  }

  // === Observe (overloaded) ===

  /**
   * Subscribe to changes in the slot. The callback is invoked
   * synchronously **once** with the current snapshot before `observe`
   * returns, then again synchronously on every `provide` /
   * `register` / disposer call for `decl.key`. Returns a disposer.
   *
   * For plain slots, the callback receives a `readonly T[]`.
   * For keyed slots, it receives a `ReadonlyMap<string, T>`.
   */
  observe<T>(decl: SlotDeclaration<T>, cb: (values: readonly T[]) => void): () => void;
  observe<T>(
    decl: KeyedSlotDeclaration<T>,
    cb: (entries: ReadonlyMap<string, T>) => void,
  ): () => void;
  observe<T>(
    decl: SlotDeclaration<T> | KeyedSlotDeclaration<T>,
    cb: ((values: readonly T[]) => void) | ((entries: ReadonlyMap<string, T>) => void),
  ): () => void {
    if (decl._kind === "plain") {
      return this._observePlain(decl.key, cb as (values: unknown[]) => void);
    }
    return this._observeKeyed(decl.key, cb as (entries: ReadonlyMap<string, unknown>) => void);
  }

  // === Internals ===

  private _observePlain(key: string, cb: (values: unknown[]) => void): () => void {
    let watchers = this._plainWatchers.get(key);
    if (!watchers) {
      watchers = new Set();
      this._plainWatchers.set(key, watchers);
    }
    watchers.add(cb);
    try {
      cb(Array.from(this._plainValues.get(key) ?? []));
    } catch (error) {
      console.error(error);
    }

    return () => {
      const ws = this._plainWatchers.get(key);
      if (!ws) return;
      ws.delete(cb);
      if (ws.size === 0) this._plainWatchers.delete(key);
    };
  }

  private _observeKeyed(
    key: string,
    cb: (entries: ReadonlyMap<string, unknown>) => void,
  ): () => void {
    let watchers = this._keyedWatchers.get(key);
    if (!watchers) {
      watchers = new Set();
      this._keyedWatchers.set(key, watchers);
    }
    watchers.add(cb);
    try {
      cb(this._snapshotKeyed(key));
    } catch (error) {
      console.error(error);
    }

    return () => {
      const ws = this._keyedWatchers.get(key);
      if (!ws) return;
      ws.delete(cb);
      if (ws.size === 0) this._keyedWatchers.delete(key);
    };
  }

  private _notifyPlain(key: string): void {
    const watchers = this._plainWatchers.get(key);
    if (!watchers) return;
    const snapshot = Array.from(this._plainValues.get(key) ?? []);
    for (const cb of watchers) {
      try {
        cb(snapshot);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private _notifyKeyed(key: string): void {
    const watchers = this._keyedWatchers.get(key);
    if (!watchers) return;
    const snapshot = this._snapshotKeyed(key);
    for (const cb of watchers) {
      try {
        cb(snapshot);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private _snapshotKeyed(key: string): ReadonlyMap<string, unknown> {
    let snap = this._keyedSnapshots.get(key);
    if (!snap) {
      const entries = this._keyedEntries.get(key);
      const map = new Map<string, unknown>();
      if (entries) {
        for (const [id, entry] of entries) map.set(id, entry.value);
      }
      snap = map;
      this._keyedSnapshots.set(key, snap);
    }
    return snap;
  }

  private _releaseKeyed(key: string, id: string): void {
    const entries = this._keyedEntries.get(key);
    if (!entries) return;
    const entry = entries.get(id);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    entries.delete(id);
    if (entries.size === 0) this._keyedEntries.delete(key);
    this._keyedSnapshots.delete(key);
    this._notifyKeyed(key);
  }
}
