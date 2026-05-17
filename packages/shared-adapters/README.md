# @statewalker/shared-adapters

## What it is

Type-safe adapter helpers for storing service, model, or state instances on
plain context objects and looking them up — optionally with hierarchical
parent-chain inheritance.

## Why it exists

Many codebases pass an ambient "context" (a plain object) to carry per-call
services: loggers, repositories, models, configuration. Direct property
access on the context (`ctx._logger`, `ctx.stage`) gets noisy and unsafe —
different modules collide on keys, types are lost, and provisioning becomes
implicit.

`newAdapter` replaces ad-hoc property access with three named functions —
`get`, `set`, `remove` — keyed by a stable string and bound to a single
TypeScript type. Adapters can lazily instantiate their value on first `get`,
walk a custom parent chain to inherit from ancestors, and are usable in any
plain-object container. `getAdapter` is a thin variant that omits the `set`
function for read-mostly adapters.

## How to use

```sh
pnpm add @statewalker/shared-adapters
```

```ts
import { newAdapter } from "@statewalker/shared-adapters";

interface Logger {
  info(msg: string): void;
}

export const [getLogger, setLogger, removeLogger] = newAdapter<Logger>(
  "app:logger",
  () => ({ info: (msg) => console.log(msg) }),
);

const ctx = {};
const log = getLogger(ctx); // factory runs once, value cached on ctx
log.info("hello");
```

## Examples

### Read-only adapter that throws when unset

```ts
import { newAdapter } from "@statewalker/shared-adapters";

interface Stage {
  name: string;
}

export const [getStage, setStage] = newAdapter<Stage>("api:stage", () => {
  throw new Error("Stage is not initiated. Use setStage to provide one.");
});

setStage(ctx, { name: "prod" });
getStage(ctx); // → { name: "prod" }
```

### Hierarchical lookup via parent chain

```ts
import { newAdapter } from "@statewalker/shared-adapters";

interface Node {
  up?: Node;
}

const [getTheme, setTheme] = newAdapter<string, Node>(
  "ui:theme",
  undefined,
  (n) => n.up,
);

const root: Node = {};
const child: Node = { up: root };
setTheme(root, "dark");
getTheme(child); // → "dark" (inherited from root)
```

### Optional lookup

```ts
const [getLogger] = newAdapter<Logger>("app:logger");
const maybe = getLogger(ctx, true); // returns undefined instead of throwing
```

## Internals

### Lookup algorithm

`get(context)` walks ancestors via `getParent`, returning the first object on
the chain that has the adapter's key. If none is found and a `create` factory
was supplied, the factory runs and the value is cached on the **original**
context (not on the ancestor that triggered the lookup). Otherwise `get`
throws — unless called with `optional = true`, in which case it returns
`undefined`.

### Defaults

- `getParent` defaults to reading `context.parent` if it exists.
- Without `create`, missing values throw on `get` (or return `undefined` with
  `optional = true`).
- Cached factory output lives on the context object itself, so the lifetime
  matches the context's lifetime — no separate registry, no GC root.

### Constraints

- Adapter keys are flat strings. Use `domain:name` (e.g. `app:logger`,
  `api:files`) to avoid collisions when many fragments share one context.
- The context must be a non-null object. Adapters do not work on primitives,
  arrays, or frozen objects (set/cache requires writability).

### Dependencies

Zero runtime dependencies.

## License

MIT — see the monorepo root `LICENSE`.
