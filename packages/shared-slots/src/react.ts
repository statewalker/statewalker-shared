import { useSyncExternalStore } from "react";
import { getSlotKey, type SlotObserve } from "./new-slot.js";
import type { Slots } from "./types.js";

/**
 * React hook: subscribe to a slot's contributions on the given `Slots` bus.
 * Returns a referentially-stable readonly array — the same reference is
 * returned across renders unless the slot has been mutated since the last
 * snapshot, so `useSyncExternalStore` does not loop.
 *
 * Pass the typed `observe` function returned by `newSlot`; `useSlot`
 * extracts the slot key from it so callers do not have to pass the key
 * twice.
 *
 * @example
 * const [provideThing, observeThing] = newSlot<Thing>("k:thing");
 *
 * function Component() {
 *   const slots = useWorkspace().requireAdapter(Slots);
 *   const things = useSlot(slots, observeThing);
 *   // things is a readonly Thing[] — re-renders when providers register/dispose
 * }
 */
export function useSlot<T>(slots: Slots, observe: SlotObserve<T>): readonly T[] {
  const key = getSlotKey(observe);
  if (!key) {
    throw new Error(
      "useSlot: the observe function was not produced by newSlot(...). " +
        "useSlot only works with typed slot observers because it needs the " +
        "slot key to read a stable getSnapshot() reference.",
    );
  }
  return useSyncExternalStore(
    (notify) => observe(slots, () => notify()),
    () => slots.getSnapshot<T>(key),
  );
}
