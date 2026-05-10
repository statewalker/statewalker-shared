import type { Slots } from "./types.js";

/**
 * Internal record shape stored on the underlying `Slots` bus under
 * `KeyedSlot`'s configured key. Each call to `register(id, value)` provides
 * exactly one such record — uniquely-identified by its own object identity
 * so the `Slots` reference-dedup contract works as intended.
 */
interface KeyedRecord<T> {
  readonly id: string;
  readonly value: T;
}

interface InternalEntry<T> {
  readonly value: T;
  readonly record: KeyedRecord<T>;
  readonly providerDisposer: () => void;
  refCount: number;
}

/**
 * Framework-agnostic id-keyed wrapper over a single `Slots` key.
 *
 * Provides Eclipse-style late-binding semantics with three properties that
 * the underlying `Slots` bus does not give for free:
 *
 *  - **id-keyed contributions** — each `{id, value}` record is addressable
 *    by id rather than by reference identity.
 *  - **collision-throw** — registering two different values under the same
 *    id throws synchronously, surfacing extension-point conflicts at
 *    registration time instead of letting them race.
 *  - **O(1) `get(id)`** — backed by a lazily-rebuilt `Map<id, T>` snapshot
 *    that tracks the underlying slot's frozen-array snapshot identity.
 *
 * `version` bumps monotonically on every change to the underlying slot's
 * contributions for the configured key — not just contributions made
 * through this instance. The wrapper subscribes to the underlying slot at
 * construction time so version reflects external mutations too. This is
 * load-bearing for `useKeyedSlot`: a consumer-side wrapper inside a
 * React component must re-render when an init-side wrapper (a different
 * `KeyedSlot` instance over the same key) registers a new entry, and
 * `useSyncExternalStore` only re-renders if the snapshot getter
 * (`wrapper.version`) returns a new value.
 */
export class KeyedSlot<T> {
  private readonly _slots: Slots;
  private readonly _slotKey: string;
  private readonly _entries = new Map<string, InternalEntry<T>>();
  private _index = new Map<string, T>();
  private _indexSnapshot: readonly KeyedRecord<T>[] | null = null;
  private _version = 0;

  constructor(slots: Slots, slotKey: string) {
    this._slots = slots;
    this._slotKey = slotKey;
    // Live subscription so external mutations of the underlying slot
    // bump `version` too. `Slots.observe` invokes the callback once
    // synchronously on subscription with the current snapshot — that
    // sets the initial version baseline.
    this._slots.observe<KeyedRecord<T>>(this._slotKey, () => {
      this._version += 1;
    });
  }

  get version(): number {
    return this._version;
  }

  /**
   * Register `value` under `id`.
   *
   * Re-registering the exact same value reference under the same id is a
   * no-op (the second disposer is still valid; only after every disposer
   * has been called does the entry actually go away).
   *
   * Registering a different value under an existing id throws `RangeError`.
   */
  register(id: string, value: T): () => void {
    const existing = this._entries.get(id);
    if (existing) {
      if (!Object.is(existing.value, value)) {
        throw new RangeError(
          `KeyedSlot: id "${id}" is already registered with a different value (slotKey="${this._slotKey}")`,
        );
      }
      existing.refCount += 1;
      return () => this._release(id);
    }
    const record: KeyedRecord<T> = { id, value };
    const providerDisposer = this._slots.provide<KeyedRecord<T>>(this._slotKey, record);
    this._entries.set(id, { value, record, providerDisposer, refCount: 1 });
    return () => this._release(id);
  }

  /**
   * O(1) lookup of the value previously registered under `id`. Returns
   * `null` for unknown ids.
   */
  get(id: string): T | null {
    const snap = this._slots.getSnapshot<KeyedRecord<T>>(this._slotKey);
    if (snap !== this._indexSnapshot) {
      const next = new Map<string, T>();
      for (const rec of snap) next.set(rec.id, rec.value);
      this._index = next;
      this._indexSnapshot = snap;
    }
    return this._index.get(id) ?? null;
  }

  /**
   * Snapshot of every currently-registered `{id, value}` pair, as a
   * fresh Map. O(n) in the entry count; intended for ad-hoc lookups
   * (e.g. "find the panel matching this flag"). Use `observe` for
   * change tracking.
   */
  entries(): ReadonlyMap<string, T> {
    const map = new Map<string, T>();
    const snap = this._slots.getSnapshot<KeyedRecord<T>>(this._slotKey);
    for (const rec of snap) map.set(rec.id, rec.value);
    return map;
  }

  /**
   * Subscribe to changes in the keyed slot. The callback is invoked
   * synchronously once with the current entries before `observe` returns,
   * then again on every subsequent change. Returns a disposer.
   */
  observe(cb: (entries: ReadonlyMap<string, T>) => void): () => void {
    return this._slots.observe<KeyedRecord<T>>(this._slotKey, () => {
      const map = new Map<string, T>();
      const snap = this._slots.getSnapshot<KeyedRecord<T>>(this._slotKey);
      for (const rec of snap) map.set(rec.id, rec.value);
      cb(map);
    });
  }

  private _release(id: string): void {
    const entry = this._entries.get(id);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    entry.providerDisposer();
    this._entries.delete(id);
  }
}
