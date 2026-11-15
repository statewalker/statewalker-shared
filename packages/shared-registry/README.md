# @statewalker/shared-registry

## What it is

`newRegistry()` returns a `[register, cleanup]` pair: `register(fn?)` adds a
listener and returns an idempotent disposer; `cleanup()` runs every
not-yet-disposed listener in **LIFO order** and awaits each one. Awaiting a
disposer or `cleanup()` means the work is done, even when several callers
ask at once.

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

### Entry point

One entry point, `@statewalker/shared-registry` (ESM, `dist/index.js` with
types). No runtime dependencies; works in browsers, Node and workers.

### API surface

- `newRegistry<E = unknown>(onError = console.error)` returns
  `[register, cleanup]`.
  - `register(callback?): () => Promise<void>` — adds a callback and returns
    its disposer. The disposer runs the callback at most once; every call
    returns the same promise, which settles when the callback has finished.
  - `cleanup(): Promise<void>` — runs all remaining callbacks, newest first,
    one after another, including callbacks registered while it runs. A call
    made while a cleanup is in flight returns that cleanup's promise.

## Examples

### Service teardown

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

Registrations live in an insertion-ordered map; `cleanup` repeatedly takes
the **most recently registered** remaining callback, awaits it, and moves on
until the map is empty. This matches typical resource-acquisition ordering:
outer resources are acquired first and released last. A callback registered
while `cleanup` runs is newer than everything left, so it runs next. (A
callback that registers a new callback every time it runs would therefore
keep `cleanup` going forever.)

### Idempotent disposers and concurrent calls

Each disposer memoises the promise of its single run. Calling the same
disposer twice, calling it while `cleanup` is running it, or calling it after
`cleanup` has already swept it runs the listener at most once, and every
call resolves only when that run has finished. A registration stays in the
registry until its listener has finished, so `cleanup` waits for a disposer
already in flight before it runs older listeners.

`cleanup` memoises its in-flight promise too: a second `cleanup()` (say a
second `SIGTERM`) returns the same promise instead of starting a parallel
sweep, so the serial LIFO order holds and `await cleanup()` means done. Once a
cleanup has finished, a later `cleanup()` starts a new sweep of whatever has
been registered since.

Do not **await** `cleanup()`, or a listener's own disposer, from inside a
listener: that promise waits for the listener itself, so the await never
settles. Calling them without awaiting is fine.

### Error handling

The default `onError` is `console.error`. Pass a custom handler in
`newRegistry(onError)` to forward to a logger or aggregator. A throwing
listener does not abort the rest of `cleanup`; the error is reported and
the next listener runs. If `onError` itself throws (or returns a rejected
promise), that failure and the original error go to `console.error`, and
cleanup still continues; disposers and `cleanup()` never reject.

The `E` in `newRegistry<E>` is not checked at runtime: a listener can throw
any value, and it is passed to `onError` as is. Keep the default `unknown`
unless every listener is known to throw `E`.

### Constraints

- Registration listeners run in series, not in parallel. This is
  intentional — many cleanup orderings depend on prior steps completing
  (e.g. flush before close).
- The `onError` callback is not awaited. If you need to ensure the error
  has been transported before continuing, do it synchronously inside
  `onError`.

### Dependencies

Zero dependencies.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
