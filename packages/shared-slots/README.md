# @statewalker/shared-slots

Typed pub/sub slots for cross-fragment extension points (Eclipse-style).

## Installation

```sh
pnpm add @statewalker/shared-slots
```

## Why this exists

Slots are the umbrella's primitive for **declared, reference-keyed
extension points**. A fragment that owns a contract declares a slot;
other fragments contribute values into it; the consumer iterates the
contributions. The shape mirrors `@statewalker/shared-intents`
exactly — one workspace = one bus, accessed via
`workspace.requireAdapter(Slots)`.

## Usage

```ts
import { newSlot, Slots } from "@statewalker/shared-slots";

// Declaration site (the contract):
interface MimeRenderer {
  match: (mime: string) => number;
  catalogId: string;
}

export const [provideMimeRenderer, observeMimeRenderers] =
  newSlot<MimeRenderer>("files:mime-renderers");

// Provider (any fragment):
import { provideMimeRenderer } from "@my-app/files";
const dispose = provideMimeRenderer(slots, {
  match: (m) => (m === "text/markdown" ? 1 : 0),
  catalogId: "markdown-viewer",
});

// Consumer (the files fragment, iterating contributions):
const renderers = slots.getSnapshot<MimeRenderer>("files:mime-renderers");
const best = renderers
  .map((r) => ({ score: r.match(mime), id: r.catalogId }))
  .sort((a, b) => b.score - a.score)[0];
```

## React

```tsx
import { useSlot } from "@statewalker/shared-slots/react";
import { observeMimeRenderers } from "@my-app/files";

function MyComponent({ slots }: { slots: Slots }) {
  const renderers = useSlot(slots, observeMimeRenderers);
  // re-renders when providers register/dispose; stable reference otherwise
  return <ul>{renderers.map((r) => <li key={r.catalogId}>{r.catalogId}</li>)}</ul>;
}
```

`useSlot` extracts the slot key from the `observe` function it
receives (attached via a hidden symbol when `newSlot` builds it),
so callers don't pass the key twice. Hand-rolled observers that
didn't go through `newSlot` won't work with `useSlot` — by design.

## API

- `Slots` — the bus class. One workspace = one bus.
  - `provide<T>(key, value): () => void`
  - `observe<T>(key, cb): () => void` (synchronous immediate snapshot
    + sync notifications)
  - `getSnapshot<T>(key): readonly T[]` (referentially stable until
    next `provide`/dispose for that key)
- `newSlot<T>(key) → [provide, observe]` — typed declaration. The
  returned tuple matches `newIntent` in shape.
- `useSlot<T>(slots, observe): readonly T[]` — React hook
  (subpath `/react`).

## Identity & dependency direction

**Reference identity.** Values are stored in a `Set`, deduped by
reference. Providing the same object twice = one entry. Two
structurally-equal-but-distinct objects = two entries. If you need
identity-by-data, dedupe at provision time.

**Dependency direction (the rule slots enforce).** The slot's
declaring module is the contract owner. The owner must not depend
on any specific provider or observer. Providers and observers may
freely import the contract. This is the one-way arrow that makes
slots Eclipse-style — a third-party plug-in can declare its own
slot and other plug-ins can contribute without touching either the
plug-in or the host.

The asymmetry vs. `Intents`: intents are RPC (bidirectional
dispatch is the point); slots are pub/sub containers (the
declaring module reads its contents, so contents-readers being
independent of contents-providers is what makes the slot
extensible).

## Related

- `@statewalker/shared-intents` — the sibling RPC bus.
- `@statewalker/shared-registry` — LIFO cleanup for
  `provide` / `observe` disposers.
- `@statewalker/workspace-api` — the `Workspace` adapter host.

## License

MIT — see the monorepo root `LICENSE`.
