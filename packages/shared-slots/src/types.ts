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

/**
 * One `observe` call. Each call gets its own record, so observing the
 * same callback twice yields two independent subscriptions, and a
 * record removed mid-notification is skipped for the rest of the pass.
 */
interface Subscription<S> {
  readonly cb: (snapshot: S) => void;
  active: boolean;
}

/**
 * Read-only view over a private `Map`, used as the keyed-slot snapshot.
 * It has no mutating methods, so a cast to `Map` cannot corrupt the
 * bus's cached snapshot.
 */
class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;

  constructor(map: Map<K, V>) {
    this.#map = map;
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  forEach(cb: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#map) cb.call(thisArg, value, key, this);
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map.entries();
  }
}

export class Slots {
  // Plain-slot storage. Each stored value maps to a token identifying
  // the contribution; a disposer only removes the value while the
  // token it captured is still the current one.
  private readonly _plainValues = new Map<string, Map<unknown, object>>();
  private readonly _plainWatchers = new Map<string, Set<Subscription<readonly unknown[]>>>();
  private readonly _plainSnapshots = new Map<string, readonly unknown[]>();

  // Keyed-slot storage. The bus owns the index and snapshot cache
  // per key, shared across all consumers of the same keyed slot.
  private readonly _keyedEntries = new Map<string, Map<string, KeyedEntry<unknown>>>();
  private readonly _keyedWatchers = new Map<
    string,
    Set<Subscription<ReadonlyMap<string, unknown>>>
  >();
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
   *
   * Disposers are idempotent: a second call is a no-op, and a disposer
   * never removes a later contribution of the same value made after
   * the value was removed.
   */
  provide<T>(decl: SlotDeclaration<T>, value: T): () => void {
    const key = decl.key;
    let bag = this._plainValues.get(key);
    if (!bag) {
      bag = new Map();
      this._plainValues.set(key, bag);
    }
    let token = bag.get(value);
    if (!token) {
      token = {};
      bag.set(value, token);
      this._plainSnapshots.delete(key);
      this._notifyPlain(key);
    }

    const owned = token;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const b = this._plainValues.get(key);
      if (!b || b.get(value) !== owned) return;
      b.delete(value);
      if (b.size === 0) this._plainValues.delete(key);
      this._plainSnapshots.delete(key);
      this._notifyPlain(key);
    };
  }

  /**
   * Read the current contributions for a slot without subscribing.
   *
   * Plain decl → returns a frozen `readonly T[]` (insertion order).
   * Keyed decl → returns a read-only `ReadonlyMap<string, T>` view
   * (registration order).
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
      return this._snapshotPlain(decl.key) as readonly T[];
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
   *
   * Disposers are idempotent: a second call is a no-op, and a disposer
   * never releases a later registration made under the same id after
   * its own entry was removed.
   */
  register<T>(decl: KeyedSlotDeclaration<T>, id: string, value: T): () => void {
    const key = decl.key;
    let entries = this._keyedEntries.get(key);
    if (!entries) {
      entries = new Map();
      this._keyedEntries.set(key, entries);
    }

    let entry = entries.get(id);
    if (entry) {
      if (!Object.is(entry.value, value)) {
        throw new RangeError(
          `Slots.register: id "${id}" is already registered with a different value (slotKey="${key}")`,
        );
      }
      entry.refCount += 1;
    } else {
      entry = { value, refCount: 1 };
      entries.set(id, entry);
      this._keyedSnapshots.delete(key);
      this._notifyKeyed(key);
    }

    const owned = entry;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this._releaseKeyed(key, id, owned);
    };
  }

  /**
   * O(1) lookup of the value previously registered under `id`. Returns
   * `null` for unknown ids — indistinguishable from a value registered
   * as `null`; use `getSnapshot(decl).has(id)` to tell them apart.
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
   * The callback receives the same cached snapshot `getSnapshot`
   * returns: a frozen `readonly T[]` for plain slots, a read-only
   * `ReadonlyMap<string, T>` view for keyed slots. Each `observe` call
   * is an independent subscription, even for the same callback.
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
      return this._subscribe(
        this._plainWatchers,
        decl.key,
        cb as (values: readonly unknown[]) => void,
        this._snapshotPlain(decl.key),
      );
    }
    return this._subscribe(
      this._keyedWatchers,
      decl.key,
      cb as (entries: ReadonlyMap<string, unknown>) => void,
      this._snapshotKeyed(decl.key),
    );
  }

  // === Internals ===

  private _subscribe<S>(
    registry: Map<string, Set<Subscription<S>>>,
    key: string,
    cb: (snapshot: S) => void,
    initial: S,
  ): () => void {
    let watchers = registry.get(key);
    if (!watchers) {
      watchers = new Set();
      registry.set(key, watchers);
    }
    const sub: Subscription<S> = { cb, active: true };
    watchers.add(sub);
    try {
      cb(initial);
    } catch (error) {
      console.error(error);
    }

    return () => {
      if (!sub.active) return;
      sub.active = false;
      const ws = registry.get(key);
      if (!ws) return;
      ws.delete(sub);
      if (ws.size === 0) registry.delete(key);
    };
  }

  private _notify<S>(watchers: Set<Subscription<S>> | undefined, snapshot: () => S): void {
    if (!watchers) return;
    const snap = snapshot();
    // Iterate a copy: observers added during this pass are not called
    // by it (they already got their immediate snapshot); observers
    // removed during it are skipped through their `active` flag.
    for (const sub of [...watchers]) {
      if (!sub.active) continue;
      try {
        sub.cb(snap);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private _notifyPlain(key: string): void {
    this._notify(this._plainWatchers.get(key), () => this._snapshotPlain(key));
  }

  private _notifyKeyed(key: string): void {
    this._notify(this._keyedWatchers.get(key), () => this._snapshotKeyed(key));
  }

  private _snapshotPlain(key: string): readonly unknown[] {
    let snap = this._plainSnapshots.get(key);
    if (!snap) {
      snap = Object.freeze(Array.from(this._plainValues.get(key)?.keys() ?? []));
      this._plainSnapshots.set(key, snap);
    }
    return snap;
  }

  private _snapshotKeyed(key: string): ReadonlyMap<string, unknown> {
    let snap = this._keyedSnapshots.get(key);
    if (!snap) {
      const entries = this._keyedEntries.get(key);
      const map = new Map<string, unknown>();
      if (entries) {
        for (const [id, entry] of entries) map.set(id, entry.value);
      }
      snap = new ReadonlyMapView(map);
      this._keyedSnapshots.set(key, snap);
    }
    return snap;
  }

  private _releaseKeyed(key: string, id: string, owned: KeyedEntry<unknown>): void {
    const entries = this._keyedEntries.get(key);
    if (!entries) return;
    // Only release the entry this disposer registered into; a later
    // registration under the same id is a different entry object.
    if (entries.get(id) !== owned) return;
    owned.refCount -= 1;
    if (owned.refCount > 0) return;
    entries.delete(id);
    if (entries.size === 0) this._keyedEntries.delete(key);
    this._keyedSnapshots.delete(key);
    this._notifyKeyed(key);
  }
}
