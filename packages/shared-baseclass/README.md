# @statewalker/shared-baseclass

## What it is

A minimal observable base class plus a small toolkit (`onChange`, `waitFor`,
`waitForValue`, `waitForSettled`, `readValues`) for turning sync update
notifications into change-aware callbacks, promises, and async iterables.

## Why it exists

A lightweight observable substrate for models — simpler than a reactive
framework, with no rendering integration and no scheduler. `BaseClass`
provides a single `notify()` / `onUpdate(cb)` channel; mutators call
`notify()` and listeners react. The rest of the package is glue that lets
callers wait on derived values without manual plumbing:

- `onChange(onUpdate, cb, getValue)` — fire only when the derived value
  actually changes (strict equality), not on every notify.
- `waitFor(onUpdate, check)` / `waitForValue(onUpdate, get)` — sync poll to a
  one-shot promise once a predicate holds.
- `waitForSettled(model)` — common `isSettled()` convention for models that
  finish loading or computing.
- `readValues(onUpdate, read)` — turn notify pulses into an async iterable of
  values.

## How to use

```sh
pnpm add @statewalker/shared-baseclass
```

```ts
import { BaseClass } from "@statewalker/shared-baseclass";

class Counter extends BaseClass {
  count = 0;
  increment(): void {
    this.count += 1;
    this.notify();
  }
}

const c = new Counter();
const off = c.onUpdate(() => console.log("count is", c.count));
c.increment();
off();
```

## Examples

### Reacting only to actual changes

```ts
import { BaseClass, onChange } from "@statewalker/shared-baseclass";

class Box extends BaseClass {
  value = 0;
  other = "x";
}

const box = new Box();
onChange(box.onUpdate, () => console.log("value changed"), () => box.value);
box.other = "y";
box.notify(); // no log (value unchanged)
box.value = 1;
box.notify(); // logs once
```

### Waiting for a value to appear

```ts
import { BaseClass, waitForValue } from "@statewalker/shared-baseclass";

class Loader extends BaseClass {
  data: string | undefined = undefined;
}

const loader = new Loader();
setTimeout(() => {
  loader.data = "ready";
  loader.notify();
}, 50);

const data = await waitForValue(loader.onUpdate, () => loader.data);
```

### Async iteration over updates

```ts
import { BaseClass, readValues } from "@statewalker/shared-baseclass";

class Stream extends BaseClass {
  next: string | undefined = undefined;
}

const s = new Stream();
const iter = readValues(s.onUpdate, () => {
  const v = s.next;
  s.next = undefined;
  return v;
});

setTimeout(() => { s.next = "a"; s.notify(); }, 0);
for await (const v of iter) {
  console.log(v); // "a", ...
  break;
}
```

### JSON round-trip

```ts
class Model extends BaseClass {
  name = "alice";
  score = 0;
  _internal = "hidden";
}
const m = new Model();
m.toJSON();   // { name: "alice", score: 0 } — drops underscore-prefixed fields and methods
m.fromJSON({ score: 5 }); // mutates and notifies if any property actually changed
```

## Internals

### Notification model

`BaseClass` holds a `Set<() => void>` of listeners. `notify()` iterates the
set synchronously. Listener disposal removes from the set. Re-registering the
same function reference is a Set-dedup no-op. `notify()` does not pass a
"changed key" — it is a fire-and-forget pulse, and derivers use
`onChange`/`waitFor` to extract semantic change information.

### Why not a Proxy?

Earlier iterations used a Proxy to auto-notify on property assignment, but
the per-access cost and "what counts as a change?" subtlety (deep equality?
array length writes? Symbol keys?) made it more trouble than it saved.
Callers now explicitly call `notify()` after mutating state — one extra line
in mutator methods, in exchange for predictable change semantics. The
`fromJSON` helper batches notifications: it diffs each key with strict
equality and notifies only once at the end if anything actually changed.

### `toJSON` / `fromJSON` conventions

`toJSON` enumerates own enumerable properties, drops methods (`typeof ===
"function"`) and underscore-prefixed fields (treated as private). `fromJSON`
assigns each key with strict-equality skip-if-same; if no key actually
changes, `notify()` is not called.

### Constraints

- No deep observability — only the top-level `notify()` pulse.
- Listeners run synchronously; an exception in one listener throws into the
  caller of `notify()`. Catch in the listener if needed.
- `readValues` requires the `read()` function to mark consumption itself
  (typically by clearing the field after returning a non-undefined value),
  since the package has no notion of "consumed".

### Dependencies

Zero runtime dependencies.

## License

MIT — see the monorepo root `LICENSE`.
