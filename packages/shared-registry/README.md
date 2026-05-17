# @statewalker/shared-registry

## What it is

`newRegistry()` returns a `[register, cleanup]` pair: `register(fn?)` adds a
listener and returns an idempotent disposer; `cleanup()` runs every
not-yet-disposed listener in **LIFO order** and awaits each one.

It is a disposer registry — not a key/value lookup. Despite the name,
this package contains no symbol lookup tables.

## Why it exists

Long-running fragments accumulate cleanup callbacks: event listeners,
subscriptions, timers, file handles, child contexts. Cleaning up in
reverse-registration order is the typical correct discipline — newest
listeners are the most-derived, often depending on earlier ones, so
tearing them down first prevents dangling references.

`newRegistry` codifies that pattern: register one callback at a time,
either dispose it individually or rely on the central `cleanup()` to run
the whole stack in LIFO order. Errors in individual callbacks are
forwarded to the supplied `onError` (default: `console.error`) and do not
abort the rest of the cleanup.

## How to use

```sh
pnpm add @statewalker/shared-registry
```

```ts
import { newRegistry } from "@statewalker/shared-registry";

const [register, cleanup] = newRegistry();

const disposeA = register(() => closeFileHandle());
const disposeB = register(async () => unsubscribe());

// individual dispose:
await disposeA();

// or tear everything down at once (LIFO):
await cleanup();
```

## Examples

### Workspace teardown

```ts
const [register, cleanup] = newRegistry((e) => log.error("cleanup failed", e));

register(() => stopWebSocketClient());
register(() => closeDatabasePool());
register(() => removeSignalHandlers());

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});
```

### Per-request cleanup hooked into the context

```ts
const requestCtx: Record<string, unknown> = {};
const [register, cleanup] = newRegistry();
requestCtx.register = register;

await runHandler(requestCtx);
await cleanup(); // tears down every per-request listener registered above
```

## Internals

### LIFO order

Registrations are keyed by a monotonic counter; `cleanup` reads
`Object.values(...).reverse()` so the **most recently registered** callback
runs first. This matches typical resource-acquisition ordering: outer
resources are acquired first and released last.

### Idempotent disposers

Each disposer guards on its own registration id. Calling the same disposer
twice — or calling it after `cleanup` has already swept it — runs the
listener at most once.

### Error handling

The default `onError` is `console.error`. Pass a custom handler in
`newRegistry(onError)` to forward to a logger or aggregator. A throwing
listener does not abort the rest of `cleanup`; the error is reported and
the next listener runs.

### Constraints

- Registration listeners run in series, not in parallel. This is
  intentional — many cleanup orderings depend on prior steps completing
  (e.g. flush before close).
- The `onError` callback is not awaited. If you need to ensure the error
  has been transported before continuing, do it synchronously inside
  `onError`.

### Dependencies

Zero runtime dependencies.

## License

MIT — see the monorepo root `LICENSE`.
