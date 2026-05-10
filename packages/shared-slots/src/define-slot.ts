/**
 * Frozen carrier returned by `defineSlot`. Pass to the `Slots` bus's
 * plain-slot methods (`provide`, `observe`, `getSnapshot`).
 *
 * The `_kind: "plain"` brand makes `slots.register(plainDecl, …)` a
 * TypeScript error.
 */
export interface SlotDeclaration<T> {
  readonly key: string;
  readonly _kind: "plain";
  /** Phantom field carrying the contribution type. Never read at runtime. */
  readonly _t?: T;
}

/**
 * Frozen carrier returned by `defineKeyedSlot`. Pass to the `Slots`
 * bus's keyed-slot methods (`register`, `get`, `observe`).
 *
 * The `_kind: "keyed"` brand makes `slots.provide(keyedDecl, …)` a
 * TypeScript error.
 */
export interface KeyedSlotDeclaration<T> {
  readonly key: string;
  readonly _kind: "keyed";
  /** Phantom field carrying the contribution type. Never read at runtime. */
  readonly _t?: T;
}

/**
 * Declare a typed plain slot by stable string key. Returns a frozen
 * `SlotDeclaration<T>` carrier. The string key is erased from the
 * consumer's surface; every site that contributes to or observes the
 * slot uses the typed declaration, not the underlying string.
 *
 * @example
 *   export const composerActionsSlot =
 *     defineSlot<ComposerAction>("chat:composer-actions");
 */
export function defineSlot<T>(key: string): SlotDeclaration<T> {
  return Object.freeze({ key, _kind: "plain" as const });
}

/**
 * Declare a typed id-keyed slot by stable string key. Returns a frozen
 * `KeyedSlotDeclaration<T>` carrier.
 *
 * Keyed slots provide id-keyed semantics on top of the plain slot bus:
 * `slots.register(decl, id, value)` registers under a stable id with
 * collision-throw on duplicate ids; `slots.get(decl, id)` returns the
 * registered value in O(1); `slots.observe(decl, cb)` notifies with a
 * `ReadonlyMap<string, T>` snapshot on each change.
 *
 * Indexing and version state for keyed slots live on the `Slots` bus
 * per slot key, so two fragments observing the same keyed slot share
 * the same cache.
 *
 * @example
 *   export const coreViewsSlot =
 *     defineKeyedSlot<ViewComponent>("core:views");
 */
export function defineKeyedSlot<T>(key: string): KeyedSlotDeclaration<T> {
  return Object.freeze({ key, _kind: "keyed" as const });
}
