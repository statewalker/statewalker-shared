# @statewalker/shared-slots

## What it is

Framework-agnostic typed pub/sub slots for declared extension points. A
slot's owning module declares the contract; other modules contribute
values; consumers iterate or look up contributions through one `Slots`
bus. Two slot kinds — plain (append-only set) and keyed (id-indexed map) —
share the same bus.

## Why it exists

Extension points let a host surface accept contributions from modules
that the host does not directly import. Hard-coding contribution lists in
the host couples it to every contributor; ad-hoc event buses lose types
and disposer hygiene.

`defineSlot` / `defineKeyedSlot` return frozen, typed declarations keyed
by stable strings. `Slots` is the runtime bus: `provide`, `register`,
`observe`, `getSnapshot`, `get`. The declaring module never names a
contributor; contributors and observers import the declaration directly.
That one-way dependency arrow makes contributions composable without
mutual imports.

## How to use

```sh
pnpm add @statewalker/shared-slots
```

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

### Entry point

One entry point, `@statewalker/shared-slots` (ESM, `dist/index.js` with
types). No runtime dependencies; works in browsers, Node and workers.
Exports `defineSlot`, `defineKeyedSlot`, `Slots`, and the types
`SlotDeclaration` and `KeyedSlotDeclaration`.

### API surface

- `defineSlot<T>(key)` — returns a frozen `SlotDeclaration<T>`.
- `defineKeyedSlot<T>(key)` — returns a frozen `KeyedSlotDeclaration<T>`.
- `Slots` — the bus class:
  - `provide(decl, value): () => void` (plain)
  - `observe(decl, cb): () => void` (overloaded for plain and keyed)
  - `getSnapshot(decl)` — `readonly T[]` for plain slots (frozen),
    `ReadonlyMap<string, T>` for keyed slots; reference-stable until the next
    change
  - `register(decl, id, value): () => void` (keyed; collision-throws)
  - `get(decl, id): T | null` (keyed)

## Examples

The snippets below use the declarations from "Declare slots".

### Plain slot: rank contributions

```ts
const slots = new Slots();

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

### Keyed slot: look up by id

```ts
// Register:
const dispose = slots.register(coreViewsSlot, "chat:turn-block:tool-call", ToolCallView);

// O(1) lookup:
const View = slots.get(coreViewsSlot, "chat:turn-block:tool-call");

// Observe a ReadonlyMap<string, T>:
const off = slots.observe(coreViewsSlot, (entries) => { /* … */ });
```

## Internals

### Plain slots

- **Reference identity.** Values stored in a `Set`, deduped by reference.
  Providing the same object twice = one entry. Two structurally-equal
  distinct objects = two entries. Plain entries are not ref-counted: if the
  same object was provided twice, the first disposer call removes it.
- **Snapshot stability.** `getSnapshot(decl)` returns a frozen array,
  reference-stable until the next mutation. Safe to feed straight into
  `useSyncExternalStore` consumers.
- **Observe.** Callback fires once synchronously with the current values,
  then synchronously on every mutation. It receives a new array each time
  (not the cached `getSnapshot` array).

### Keyed slots

- **Collision-throw.** Registering two *different* values under the same
  id throws synchronously:
  `RangeError: Slots.register: id "<id>" is already registered with a different value (slotKey="<key>")`.
- **Ref-counted re-register.** Registering the *same* value reference
  under the same id is a ref-counted no-op (the entry survives until
  every disposer fires).
- **O(1) lookup.** `get(decl, id)` reads from a per-key index cached
  on the bus.
- **Observe.** Same semantics as plain — sync immediate snapshot then
  sync notifications, with `ReadonlyMap<string, T>` as the value.

### Bus scoping

`Slots` is a plain class. Construct one bus per scope (typically per
top-level composition unit) and share that instance between providers
and observers. Plain and keyed slot kinds use independent internal maps,
so the same key string in both kinds refers to two unrelated slots.

### Dependency direction

The slot's declaring module is the contract owner. The owner must not
depend on any specific provider or observer. Providers and observers may
freely import the contract. This is the one-way arrow that makes a
third-party module able to declare its own slot and others contribute
without touching either the module or the host.

### Constraints

- Snapshots are frozen but the values they contain are not — consumers
  must not mutate contributed objects.
- Observers run synchronously; an exception in one observer is caught
  and reported via `console.error`, then the remaining observers fire.
- Two different `Slots` instances are completely isolated — there is no
  cross-instance broadcast.

### Dependencies

Zero dependencies.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
