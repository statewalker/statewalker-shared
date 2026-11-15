# @statewalker/shared-commands

## What it is

A typed command bus and command registries. A module declares a command (key,
input and output schemas, dispatch policy, optional label / description /
icon). Other modules listen for it on a `Commands` bus, and callers dispatch
it through the same bus. `CommandsRegistry` holds catalogs of declarations
that can be composed, filtered and prefixed.

## Why it exists

Modules that cooperate should not have to import each other. A UI menu should
not hard-code which module handles "save", and an AI agent's tool list should
not depend on whether a tool is served locally or by a remote adapter. With
this package the caller and the handler share only the declaration:

- the **bus** decouples the caller from whoever handles the command, with a
  dispatch policy that says what happens when nobody does;
- the **declaration** carries [Standard Schema](https://standardschema.dev/)
  input/output schemas (Zod, Valibot, ArkType, …) for validation and for
  deriving JSON Schema, plus UX metadata for menus;
- **registries** collect declarations from many sources into one view, for
  menus, action bars, or tool lists handed to an AI model.

## How to use

Install:

```sh
pnpm add @statewalker/shared-commands
```

Three primitives:

1. **Declare** a command with `Command.required(key)` / `.async(key)` /
   `.silent(key)` / `.custom(key, policy)`. Carries input/output schemas,
   dispatch policy, and optional UX metadata.
2. **Create** a bus (`Commands.create()`) and a registry
   (`CommandsRegistry.create(...decls?)`).
3. **Listen** for declared commands on the bus; **call** them to dispatch.

The full DX is in [Examples](#examples). API surface at a glance:

| Concept | Entry point |
|---|---|
| Build a declaration | `Command.required / .async / .silent / .custom` → `.input / .output / .label / .description / .icon / .build()` |
| Create a bus | `Commands.create()` |
| Dispatch | `commands.call(decl, payload).promise` |
| Listen | `commands.listen(decl, fn, { priority? }) → dispose` |
| Create a registry | `CommandsRegistry.create(...decls?)` → `.set(...) / .remove(...)` |
| Derive a registry | `CommandsRegistry.compose / .filter / .namespace` |
| Discriminate failures | `e instanceof CommandError && e.kind` |

### Entry point and exports

One entry point, `@statewalker/shared-commands` (ESM, `dist/index.js` with
types). It runs in browsers, Node and workers. Runtime dependencies:
`@standard-community/standard-json`, `@standard-schema/spec` and
`@statewalker/shared-baseclass`. Install the
schema library you use (for example `zod`) yourself.

Exports:

- `Command` — declaration builder (`required` / `async` / `silent` /
  `custom`); also the `Command<P, R>` type of a dispatched command.
- `Commands` — the bus class (`Commands.create()` or `new Commands()`).
- `CommandsRegistry` — registry factories; also the read-only registry
  interface. `MutableCommandsRegistry` — type of `CommandsRegistry.create()`.
- `CommandError`, `CommandErrorKind`, `CommandErrorOptions`.
- `REQUIRED`, `ASYNC`, `SILENT` — the preset `DispatchPolicy` objects;
  `DispatchPolicy` type.
- `passthrough<T>()` — a Standard Schema that accepts any value as `T`
  without validation.
- Types: `CommandDeclaration`, `CommandListener`, and the builder stages
  `PolicyChosen`, `InputSet`, `Buildable`.

## Examples

### Declare a command

```ts
import { Command } from "@statewalker/shared-commands";
import { z } from "zod";

export const PickFileCommand = Command.required("platform:pick-file")
  .input(z.object({ multiple: z.boolean().optional() }))
  .output(z.object({ blobs: z.array(z.instanceof(Blob)) }))
  .label("Pick File")
  .description("Open the file picker.")
  .icon("folder-open")
  .build();
```

Policy is declared first; `.build()` is the explicit terminator. The chain
runs through four phases:

1. **Policy** — `Command.required(key)` / `Command.async(key)` / `Command.silent(key)` / `Command.custom(key, policy)`.
2. **Input** — `.input(schema)` accepts any [Standard Schema](https://standardschema.dev/)–compliant
   library (Zod, Valibot, ArkType, TypeBox, …). Types are inferred from the schema.
3. **Output** — `.output(schema)`. Same.
4. **Optional UX metadata** — `.label` / `.description` / `.icon`, any order,
   each at most once (a second call throws).

JSON Schema is derived from the Standard Schemas via
[`@standard-community/standard-json`](https://github.com/standard-community/standard-json) —
no schema-lib-specific helper packages, no Zod-as-contract.

`.build()` throws if `.input` or `.output` was not called. Use
`passthrough<T>()` as a schema when you want types without runtime validation.

`Command.custom(key, policy)` for combinations beyond the three named presets:

```ts
import { Command, passthrough } from "@statewalker/shared-commands";

const X = Command.custom("x", { onNoHandlers: "wait", onAllObserveOnly: "reject" })
  .input(passthrough<{ id: string }>())
  .output(passthrough<boolean>())
  .build();
```

The `Command` namespace value coexists with the `Command<P, R>` type used by the
bus's `call()` return — TypeScript distinguishes them by position (type-side vs.
value-side), like `Array` / `Promise` / `Set`.

### Dispatch & listen

```ts
import { Commands } from "@statewalker/shared-commands";

const commands = Commands.create();

commands.listen(PickFileCommand, async (cmd) => {
  const handles = await showOpenFilePicker({ multiple: cmd.payload.multiple });
  return { blobs: await Promise.all(handles.map((h) => h.getFile())) };
});

const { blobs } = await commands.call(PickFileCommand, { multiple: true }).promise;
```

`Commands` is a class; `Commands.create()` is equivalent to `new Commands()`.

A listener returns one of:

- `void` / `undefined` — observe only (does not claim).
- `true` — claim, settle later via `cmd.resolve(...)` / `cmd.reject(...)` from
  outside (button click, timer fires, …).
- `Promise<R>` — claim and settle when the promise resolves.

**Priority.** `commands.listen(decl, fn, { priority })` controls invocation
order. Default `0`; higher fires earlier; ties unspecified. A claim
short-circuits the dispatch: once a listener returns `true` or a promise,
lower-priority listeners do not run. Observers (listeners returning `void`)
at a higher priority than the claimer still run. Negative priorities are the
convention for default / fallback handlers:

```ts
commands.listen(decl, fn);                          // default — priority 0
commands.listen(decl, override, { priority: 100 }); // early — its claim stops the dispatch
commands.listen(decl, fallback, { priority: -1 });  // late — fires only if no higher-priority listener claimed
```

A host overrides a default handler by listening at a higher priority and
claiming: the default handler never sees the command, so it needs no way to
tell whether someone else took it.

**Validation** runs at the bus boundary: `payload` is validated against
`inputSchema` before any listener sees the command (failure → call rejects
with `CommandError("input-validation")`, no listener invoked). Listeners see
the schema's validated value as `cmd.payload`, so defaults, coercions and
transforms apply. The first `cmd.resolve(value)` is validated against
`outputSchema` (failure → call rejects with `CommandError("output-validation")`;
when the value came from a listener's returned promise, `error.listener` is
that listener), and the caller's promise resolves with the validated value.
A validator that throws instead of returning issues is reported the same way,
with the thrown error as `error.cause`.

### Registries

```ts
import { CommandsRegistry } from "@statewalker/shared-commands";

// Build a mutable bundle — variadic seed + chainable .set / .remove
const fileTools = CommandsRegistry.create(ReadFileCommand, WriteFileCommand)
  .set(GrepFilesCommand, EditFileCommand)
  .remove("fs:obsolete-tool");

// Compose multiple sources into a single read-only view
const allTools = CommandsRegistry.compose(fileTools, mcpRegistry, openApiRegistry);

// Filter (capability gate, agent whitelist, …)
const agentTools = CommandsRegistry.filter(allTools, (decl) => decl.key.startsWith("fs:"));

// Namespace (mount external adapter at a stable prefix)
const mcpFs = CommandsRegistry.namespace(mcpClient.registry, "mcp:filesystem:");

// React to changes anywhere in the tree
const unsub = allTools.onUpdate(() => {
  // re-project tools for the AI model, re-render the menu, …
});
```

Surface (all static on the `CommandsRegistry` namespace):

- **`CommandsRegistry.create(...decls?)`** — fresh `MutableCommandsRegistry`, optionally seeded.
- **`CommandsRegistry.compose(...sources)`** — read-only union: `list()` concatenates, `get()` first-match wins, `onUpdate` fans out.
- **`CommandsRegistry.filter(source, predicate)`** — predicate-filtered read-only view.
- **`CommandsRegistry.namespace(source, prefix)`** — returns copies of the declarations with `prefix` added to `key`. A copy dispatches under the prefixed key, so listeners must be registered for the prefixed declaration.
- Plus methods on the instance: `list` / `get` / `onUpdate` (read), `set(...decls): this` / `remove(...keys): this` (mutable, variadic, chainable).

The `CommandsRegistry` namespace value coexists with the `CommandsRegistry` interface type — same TypeScript trick as `Command` / `Command<P, R>`.

### Failure / edge path

The bus rejects with a single `CommandError` class carrying a discriminated
`kind` field. Callers can handle generically (`instanceof CommandError`) or
switch on `kind`:

```ts
import { CommandError } from "@statewalker/shared-commands";

try {
  const { blobs } = await commands.call(PickFileCommand, { multiple: "yes" }).promise;
} catch (e) {
  if (e instanceof CommandError) {
    switch (e.kind) {
      case "input-validation":  break; // payload failed inputSchema
      case "no-handlers":       break; // policy = required/async, zero listeners
      case "not-claimed":       break; // policy = required, only observers
      case "listener-threw":    break; // a handler threw or its promise rejected
      case "output-validation": break; // a handler resolved with invalid shape
    }
  }
}
```

The error `message` is `<kind>: <command key>`, for example
`no-handlers: platform:pick-file`. `error.cause` holds the validator issues or
the listener's error, and `error.commandKey` the key.

Pending-forever is **not** a `CommandError` — `silent` commands with no handlers
intentionally never resolve. Callers either don't `await` them, or guard with
`Promise.race` and a timeout.

## Internals

The bus stores listeners in a `Map<key, ListenerRecord[]>` where each record
carries `{ fn, priority, seq }`. Dispatch snapshots the listener list, sorts
by descending `priority` (ties resolved by `seq` — insertion order, but
documented as unspecified), and iterates synchronously. A claim
short-circuits the dispatch: lower-priority listeners do not run. The loop
stops at the first listener that returns `true` or a promise, or that
settles the command directly with `cmd.resolve` / `cmd.reject`. The first
listener that throws also short-circuits the dispatch — remaining listeners
do not run, and the bus rejects with `CommandError("listener-threw")`
reporting the offending function. (A listener whose returned promise rejects
has already claimed, so the listeners after it never ran.)

Input validation runs first via Standard Schema's `~standard.validate`. If
the validator returns a sync result, the listener pass runs synchronously
after `commands.call(...)` returns. If the validator returns a Promise (some
schemas use async refinements), the listener pass is deferred until the
promise resolves — `commands.call(...)` still returns the `Command<P, R>`
synchronously, but its `promise` settles later.

Output validation runs on the first `cmd.resolve(value)` — whether it comes
from a listener-returned Promise or an explicit `cmd.resolve` call. The first
`resolve` or `reject` settles the command: `cmd.settled` becomes `true` and
the command counts as claimed at once, even when the output schema validates
asynchronously, and later `resolve` / `reject` calls are ignored. A `resolve`
with an invalid value settles it as a rejection.

Every route goes through one lifecycle owned by the bus — pending, claimed
(a listener returned `true` or a promise), validating (the first `resolve`
arrived; the output schema runs once), settled — so a listener's direct
`resolve` / `reject`, its returned promise, its throw and the caller's own
`resolve` / `reject` follow the same rules. The command value exposes only
`key`, `payload`, `settled` (read-only), `resolve`, `reject` and `promise`.

`CommandsRegistry.create(...)` holds a `Map<string, CommandDeclaration>` and
a `Set<() => void>` of `onUpdate` subscribers. Variadic `.set(...)` is
atomic: keys are pre-checked for collision (different reference under same
key) before any entry is added; on collision a `RangeError` is thrown and
the map is unchanged. Duplicate keys inside one `.set(...)` call are not
checked against each other: the first declaration is kept. Idempotent re-registration (same reference) is a
no-op (no `onUpdate` fire). Composed / filtered / namespaced views hold no
state beyond a cache — subscribers and lookups delegate to the underlying
source(s). A namespace view returns one frozen wrapper per source declaration
(cached in a `WeakMap`), so `ns.get(k) === ns.get(k)` and re-adding a wrapper
to a mutable registry is a no-op; its JSON-schema getters delegate to the
source declaration and are not evaluated by `list()` / `get()`.

JSON Schema (`inputJsonSchema` / `outputJsonSchema`) is exposed as a lazy
`Promise<Record<string, unknown>>` getter on each declaration. The first
read triggers async vendor loading inside
`@standard-community/standard-json`; subsequent reads return the cached
Promise. This keeps the substrate validator-agnostic — Zod, Valibot,
ArkType, TypeBox, Effect Schema, Sury are supported by
`@standard-community/standard-json`; other validators can be registered with
its `loadVendor` function. A `passthrough()` schema derives `{}` (any value).

### Constraints

- Each builder stage returns a new builder, so branching from a shared stage
  (`const base = Command.required(k).input(s)`) is safe.
- Builder misuse throws at declaration time:
  `Command "<key>": .input(...) and .output(...) must be called before .build()`,
  and `Command "<key>": label already set` (same for `description`, `icon`).
- Registering (or seeding `create(...)` with) a different declaration under an existing key throws
  `RangeError: CommandsRegistry: key "<key>" already registered with a different declaration`.

- A claim short-circuits dispatch, and so does a listener throw. Observers
  at a lower priority than a claiming (or throwing) handler do not run.
  Register observers that must see every dispatch at a higher priority than
  any handler.
- Same-priority dispatch order is unspecified. If a caller needs
  deterministic order, encode it as priority.
- Pending-forever (silent policy with no claimer) is intentional and is
  NOT reported as a `CommandError`. Callers using `Command.silent` either
  arrange external resolution (timer, dialog dismiss, …) or wrap the
  promise in `Promise.race` with a timeout.
- `inputJsonSchema` / `outputJsonSchema` are Promises, not sync values. AI
  tool projection and OpenAPI export consumers await them at projection
  time; UI menus that only need `label` / `description` / `icon` ignore
  them entirely.
- Mutating a registry view (`compose` / `filter` / `namespace`) is not
  possible — these are read-only by type. Mutate the underlying
  `MutableCommandsRegistry` instead.

### Dependencies

- `@standard-schema/spec` — type-only. The substrate accepts any
  Standard-Schema-compliant validator for `.input(schema)` / `.output(schema)`.
- `@standard-community/standard-json` — runtime, async-first. Derives
  JSON Schema from Standard Schemas. Vendors (zod, valibot, arktype,
  typebox, sury, effect) are dynamically imported on first use.
- `@statewalker/shared-baseclass` — runtime. The mutable registry's
  `onUpdate` subscribers live in its `Notifier`. Every subscriber runs even
  when one throws, and the error is rethrown to the caller of `set` /
  `remove` afterwards. Disposers are idempotent, and subscribing the same
  function twice keeps one subscription.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
