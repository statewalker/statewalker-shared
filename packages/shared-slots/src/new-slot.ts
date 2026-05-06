import type { Slots } from "./types.js";

export type SlotProvide<T> = (slots: Slots, value: T) => () => void;
export type SlotObserve<T> = (slots: Slots, cb: (values: T[]) => void) => () => void;

/**
 * Hidden symbol used to attach the slot's string key to the typed
 * `provide` / `observe` functions returned by `newSlot`. The `useSlot`
 * React hook reads the key back so it can call `Slots.getSnapshot(key)`
 * for `useSyncExternalStore`'s snapshot getter without forcing every
 * consumer to pass the key twice.
 */
export const SLOT_KEY: unique symbol = Symbol("statewalker:shared-slots:key");

interface KeyBound {
  [SLOT_KEY]?: string;
}

/**
 * Declare a typed slot by stable string key. Returns a `[provide, observe]`
 * tuple where each function takes the workspace's `Slots` bus as its first
 * argument — same shape as `newIntent` from `@statewalker/shared-intents`.
 *
 * The string key is erased from the consumer's surface; every site that
 * contributes to or observes the slot uses the typed `provide` / `observe`
 * functions, not the underlying string.
 */
export function newSlot<T>(key: string): [provide: SlotProvide<T>, observe: SlotObserve<T>] {
  const provide: SlotProvide<T> = (slots, value) => slots.provide<T>(key, value);
  const observe: SlotObserve<T> = (slots, cb) => slots.observe<T>(key, cb);
  (provide as unknown as KeyBound)[SLOT_KEY] = key;
  (observe as unknown as KeyBound)[SLOT_KEY] = key;
  return [provide, observe];
}

/**
 * Read the slot key from a `provide` / `observe` function returned by
 * `newSlot`. Returns `undefined` for hand-rolled functions that didn't go
 * through `newSlot`. Used by the React `useSlot` hook.
 */
export function getSlotKey(fn: SlotProvide<unknown> | SlotObserve<unknown>): string | undefined {
  return (fn as unknown as KeyBound)[SLOT_KEY];
}
