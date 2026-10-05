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

### Entry point

One entry point, `@statewalker/shared-baseclass` (ESM, `dist/index.js` with
types). No runtime dependencies; works in browsers, Node and workers.

### API surface

- `BaseClass` — `onUpdate(cb): () => void` (an arrow property, so it can be
  passed around unbound), `notify()`, `toJSON()`, `fromJSON(obj): this`.
- `onChange(onUpdate, callback, getValue): () => void` — call `callback` only
  when `getValue()` changes (strict equality).
- `onChangeNotifier(onUpdate, getValue)` — same, returned as a reusable
  `(callback) => unsubscribe` function.
- `waitFor(onUpdate, check): Promise<void>` — resolve once `check()` is true.
- `waitForValue(onUpdate, get): Promise<T>` — resolve with the first
  non-`undefined` value of `get()`.
- `waitForSettled(model): Promise<model>` — `waitFor` on `model.isSettled()`;
  the model must match the exported `Settleable` interface.
- `readValues(onUpdate, read): AsyncGenerator<T>` — yield every
  non-`undefined` value of `read()`, re-reading after each update.

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

### Waiting for a condition or a settled model

```ts
import { BaseClass, waitFor, waitForSettled } from "@statewalker/shared-baseclass";

class Job extends BaseClass {
  done = false;
  isSettled(): boolean {
    return this.done;
  }
}

const job = new Job();
setTimeout(() => {
  job.done = true;
  job.notify();
}, 10);

await waitFor(job.onUpdate, () => job.done); // resolves once done is true
await waitForSettled(job); // same, through the isSettled() convention
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

### Why changes are signalled explicitly, not with a Proxy

Property assignment does not notify. Callers call `notify()` after
mutating state. An auto-notifying Proxy would add a cost to every property
access and would have to decide what counts as a change (deep equality,
array length writes, Symbol keys). An explicit `notify()` costs one line per
mutator and gives predictable change semantics. `fromJSON` follows the same
rule: it diffs each key with strict equality and notifies once at the end,
only if something changed.

### `toJSON` / `fromJSON` conventions

`toJSON` enumerates own enumerable properties, drops methods (`typeof ===
"function"`) and underscore-prefixed fields (treated as private). `fromJSON`
assigns each key with strict-equality skip-if-same; if no key actually
changes, `notify()` is not called.

### Constraints

- Forgetting `notify()` after a mutation is silent: listeners, `waitFor`
  promises and `readValues` loops simply do not see the change.
- `waitFor` / `waitForValue` / `waitForSettled` have no timeout; if the
  condition never becomes true, the promise never settles.

- No deep observability — only the top-level `notify()` pulse.
- Listeners run synchronously; an exception in one listener throws into the
  caller of `notify()`. Catch in the listener if needed.
- `readValues` requires the `read()` function to mark consumption itself
  (typically by clearing the field after returning a non-undefined value),
  since the package has no notion of "consumed".

### Dependencies

Zero dependencies.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
