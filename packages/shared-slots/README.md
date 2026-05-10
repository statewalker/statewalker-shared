# @statewalker/shared-slots

Typed pub/sub slots for cross-fragment extension points.

## Installation

```sh
pnpm add @statewalker/shared-slots
```

## Why this exists

Slots are the umbrella's primitive for **declared extension points**.
A fragment owning a surface declares a slot; other fragments contribute
values; the consumer iterates the contributions.

Two flavors share one bus:

- **Plain slot** (`defineSlot<T>(key)`) — append-only, reference-deduped
  set. Used when contributions are consumed together (e.g. a sorted
  list of toolbar actions).
- **Keyed slot** (`defineKeyedSlot<T>(key)`) — id-keyed map with
  collision-throw on duplicate ids. Used when contributions are
  addressable by stable id (e.g. registries of components by viewKey).

One workspace = one bus, accessed via `workspace.requireAdapter(Slots)`.

## Usage

### Declare slots

```ts
import { defineSlot, defineKeyedSlot, Slots } from "@statewalker/shared-slots";

interface MimeRenderer {
  match: (mime: string) => number;
  catalogId: string;
}

// Plain slot — many providers, all consumed together.
export const mimeRenderersSlot =
  defineSlot<MimeRenderer>("files:mime-renderers");

// Keyed slot — id-addressable.
export const coreViewsSlot =
  defineKeyedSlot<ViewComponent>("core:views");
```

### Plain-slot operations

```ts
const slots = workspace.requireAdapter(Slots);

// Provider:
const dispose = slots.provide(mimeRenderersSlot, {
  match: (m) => (m === "text/markdown" ? 1 : 0),
  catalogId: "markdown-viewer",
});

// Consumer:
const renderers = slots.getSnapshot(mimeRenderersSlot);
const best = renderers
  .map((r) => ({ score: r.match(mime), id: r.catalogId }))
  .sort((a, b) => b.score - a.score)[0];

// Observer:
const off = slots.observe(mimeRenderersSlot, (rs) => { /* … */ });
```

### Keyed-slot operations

```ts
// Register:
const dispose = slots.register(coreViewsSlot, "chat:turn-block:tool-call", ToolCallView);

// O(1) lookup:
const View = slots.get(coreViewsSlot, "chat:turn-block:tool-call");

// Observe a ReadonlyMap<string, T>:
const off = slots.observe(coreViewsSlot, (entries) => { /* … */ });
```

## Semantics

### Plain slots

- **Reference identity.** Values stored in a `Set`, deduped by reference.
  Providing the same object twice = one entry. Two structurally-equal
  distinct objects = two entries.
- **Snapshot stability.** `getSnapshot(decl)` returns a frozen
  array, reference-stable until the next mutation.
  `useSyncExternalStore`-safe.
- **Observe.** Callback fires once synchronously with the current
  snapshot, then synchronously on every mutation.

### Keyed slots

- **Collision-throw.** Registering two *different* values under the
  same id throws `RangeError` synchronously.
- **Ref-counted re-register.** Registering the *same* value reference
  under the same id is a ref-counted no-op (the entry survives until
  every disposer fires).
- **O(1) lookup.** `get(decl, id)` reads from a per-key index cached
  on the bus.
- **Observe.** Same semantics as plain — sync immediate snapshot then
  sync notifications, with `ReadonlyMap<string, T>` as the value.

### Workspace scoping

`Slots` is registered on the workspace as an adapter. **One workspace
= one bus**: contributions made by one fragment are observable by
every other fragment in the same composition. Direct `new Slots()` is
supported for tests only.

### Dependency direction

The slot's declaring module is the contract owner. The owner must
not depend on any specific provider or observer. Providers and
observers may freely import the contract. This is the one-way arrow
that makes slots Eclipse-style — a third-party fragment can declare
its own slot and other fragments can contribute without touching
either the fragment or the host.

## API

- `defineSlot<T>(key)` — returns a frozen `SlotDeclaration<T>`.
- `defineKeyedSlot<T>(key)` — returns a frozen `KeyedSlotDeclaration<T>`.
- `Slots` — the bus class:
  - `provide(decl, value): () => void` (plain)
  - `observe(decl, cb): () => void` (overloaded for plain and keyed)
  - `getSnapshot(decl): readonly T[]` (plain only)
  - `register(decl, id, value): () => void` (keyed; collision-throws)
  - `get(decl, id): T | null` (keyed)

## Related

- `@statewalker/shared-commands` — the sibling RPC bus (was: shared-intents).
- `@statewalker/shared-registry` — LIFO cleanup for `provide` /
  `register` / `observe` disposers.
- `@statewalker/workspace` — the `Workspace` adapter host.

## License

MIT — see the monorepo root `LICENSE`.
