# @statewalker/shared-generators

## What it is

`newAsyncGenerator` bridges callback-style producers (`next(value)` / `done()`)
to a standard async iterable, with proper backpressure: producers `await
next(value)` and learn whether the consumer actually took the value.
`newAsyncGeneratorFunction` packages that bridge as a reusable factory
function.

## Why it exists

Many statewalker subsystems push values from imperative event sources —
WebSocket frames, FSM transitions, FS watcher events. Wrapping each into a
hand-rolled async generator is repetitive and easy to get wrong: missing
cleanup, lost values under backpressure, or runaway memory when the producer
outruns the consumer.

This package centralises that bridge:

- Producer-facing API is `(next, done)` plus an optional cleanup return.
- Consumer-facing API is a vanilla `for await … of`.
- `next` / `done` return promises that resolve `true` once the value was
  actually yielded (or `false` if the generator was closed without yielding
  it) — producers can implement backpressure or skip-stale strategies.
- `skipValues` mode replaces the queue with single-slot "latest wins"
  semantics for UI-style streams where only the last update matters.

## How to use

```sh
pnpm add @statewalker/shared-generators
```

```ts
import { newAsyncGenerator } from "@statewalker/shared-generators";

const gen = newAsyncGenerator<number>((next, done) => {
  let i = 0;
  const id = setInterval(async () => {
    if (i < 5) {
      await next(i++);
    } else {
      await done();
    }
  }, 100);
  return () => clearInterval(id);
});

for await (const n of gen) {
  console.log(n); // 0, 1, 2, 3, 4
}
```

## Examples

### Reusable factory via `newAsyncGeneratorFunction`

```ts
import { newAsyncGeneratorFunction } from "@statewalker/shared-generators";

const watchClicks = newAsyncGeneratorFunction<MouseEvent>((next) => {
  const handler = (e: MouseEvent) => next(e);
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
});

for await (const event of watchClicks()) {
  console.log(event.clientX);
  if (someCondition) break; // cleanup runs automatically
}
```

### Skip-stale (latest-wins) mode

```ts
const gen = newAsyncGenerator<number>((next, done) => {
  let frame = 0;
  const id = setInterval(() => {
    next(frame++); // not awaited — older values dropped if consumer is slow
  }, 16);
  return () => clearInterval(id);
}, /* skipValues */ true);

for await (const frame of gen) {
  await renderSlowly(frame); // only the latest pending frame is delivered
}
```

## Internals

### Backpressure via promise-acked enqueue

Each call to `next(value)` (or `done(err?)`) returns a `Promise<boolean>`.
The generator's internal linked-list queue stores the value alongside its
resolver. When the consumer pulls a value (`for await` ticks), the resolver
fires with `true`. If the generator closes before yielding the value, the
resolver fires with `false`. Producers that `await next(...)` therefore know
whether their value reached the consumer.

### Skip-stale variant

With `skipValues = true`, each new `next(...)` drains the queue before
enqueuing the new slot — older pending values resolve with `false`. This
gives O(1) memory regardless of producer rate, matching the "discard
intermediate, keep latest" pattern used by UI rendering pipelines.

### Cleanup

The init function may return a cleanup callback (sync or async). It runs in
the generator's `finally` — on normal completion, on consumer-side
`return()` / `break`, or on consumer-side error. Pending queue slots are
drained (resolving with `false`) at the same point.

### Constraints

- Generators are single-consumer. Pulling from the same generator instance
  twice concurrently is undefined behaviour.
- `done(error)` causes the generator to throw the supplied error to the
  consumer. With no error, it completes normally.
- `newAsyncGeneratorFunction` exposes only the `next` callback to its
  listen function; producers that need the `done` channel should use
  `newAsyncGenerator` directly.

### Dependencies

Zero runtime dependencies.

## License

MIT — see the monorepo root `LICENSE`.
