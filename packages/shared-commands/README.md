# @statewalker/shared-commands

## What it is

Typed command bus **and** reactive command registry — one package providing
both the dispatch substrate (bus, declarations, dispatch policies) and the
catalog substrate (registries, composition primitives) used for cross-fragment
late binding, AI-agent tool projection, and UI menu / action composition.

## Why it exists

Late binding is a recurring need across the monorepo. Fragments shouldn't have
to import each other to talk; UI menus shouldn't hard-code which fragment
handles "save"; AI agents shouldn't know whether a file-read came from a local
handler, an MCP server, or a remote gRPC service.

**v1** scoped this to one workspace's fragments — a typed RPC bus with
first-claim-wins listeners. Useful but narrow.

**v2** extends the same substrate to be a universal:

- **Tool surface for AI agents.** Each Command projects to a Vercel AI SDK
  tool via one generic bridge (`ai-agent` owns the bridge; this package owns
  everything upstream).
- **Mount point for external APIs.** MCP servers, OpenAPI / gRPC / GraphQL
  services are brought into the bus by adapter packages — every external
  protocol's tools become Commands; consumers see no protocol-specific code.
- **Action library for UI.** Menus, action bars, keyboard shortcuts pull from
  a `CommandsRegistry`; the same `Command` declaration carries the schema
  (for invocation) and the UX metadata (`label` / `icon` / i18n key).

A single registry composition mechanism plus a single dispatch mechanism
replace what would otherwise be one bridge per protocol times one ergonomic
shim per consumer. Capability filtering, observation wrappers, and
hierarchical delegation drop in as alternative `Commands` and
`CommandsRegistry` factories without changing this contract.

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
4. **Optional UX metadata** — `.label` / `.description` / `.icon`, any order.

JSON Schema is derived from the Standard Schemas via
[`@standard-community/standard-json`](https://github.com/standard-community/standard-json) —
no schema-lib-specific helper packages, no Zod-as-contract.

`.label` / `.description` are i18n fallbacks; the i18n layer overrides them via
`command.{key}.label` / `command.{key}.description`.

`Command.custom(key, policy)` for combinations beyond the three named presets:

```ts
const X = Command.custom("x", { onNoHandlers: "wait", onAllObserveOnly: "reject" })
  .input(s).output(s).build();
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

`Commands.create()` is the single factory for the reference implementation.
Future alternative implementations (composites, hierarchical with parent
delegation, observation wrappers, capability-filtered) are exposed as their own
static factories on the `Commands` namespace (`Commands.composed(...)`,
`Commands.filtered(parent, predicate)`, …) without changing the `Commands`
interface or this consumer-side ergonomics.

A listener returns one of:

- `void` / `undefined` — observe only (does not claim).
- `true` — claim, settle later via `cmd.resolve(...)` / `cmd.reject(...)` from
  outside (button click, timer fires, …).
- `Promise<R>` — claim and settle when the promise resolves.

**Priority.** `commands.listen(decl, fn, { priority })` controls invocation
order. Default `0`; higher fires earlier; ties unspecified. Negative
priorities are the convention for default / fallback handlers:

```ts
commands.listen(decl, fn);                          // default — priority 0
commands.listen(decl, validator, { priority: 100 }); // early — short-circuit
commands.listen(decl, fallback, { priority: -1 });   // late — fires after all others
```

**Validation** runs at the bus boundary: `payload` is validated against
`inputSchema` before any listener sees the command (failure → call rejects,
no listener invoked). Each `cmd.resolve(value)` is validated against
`outputSchema` (failure → call rejects with `CommandError("output-validation")`,
the offending listener is reported).

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
- **`CommandsRegistry.namespace(source, prefix)`** — wraps each declaration's `key` with the prefix.
- Plus methods on the instance: `list` / `get` / `onUpdate` (read), `set(...decls): this` / `remove(...keys): this` (mutable, variadic, chainable).

The `CommandsRegistry` namespace value coexists with the `CommandsRegistry` interface type — same TypeScript trick as `Command` / `Command<P, R>` and `Commands`.

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

Pending-forever is **not** a `CommandError` — `silent` commands with no handlers
intentionally never resolve. Callers either don't `await` them, or guard with
`Promise.race` and a timeout.

## Internals

The bus stores listeners in a `Map<key, ListenerRecord[]>` where each record
carries `{ fn, priority, seq }`. Dispatch snapshots the listener list, sorts
by descending `priority` (ties resolved by `seq` — insertion order, but
documented as unspecified), and iterates synchronously. The first listener
that throws (or returns a rejecting promise) short-circuits the dispatch —
remaining listeners do not run, and the bus rejects with
`CommandError("listener-threw")` reporting the offending function.

Input validation runs first via Standard Schema's `~standard.validate`. If
the validator returns a sync result, the listener pass runs synchronously
after `commands.call(...)` returns. If the validator returns a Promise (some
schemas use async refinements), the listener pass is deferred until the
promise resolves — `commands.call(...)` still returns the `Command<P, R>`
synchronously, but its `promise` settles later.

Output validation runs on every `cmd.resolve(value)` — both
listener-returned Promise resolves and explicit `cmd.resolve` calls from
inside listeners. Settled-guard ensures only the first valid resolve wins.

`CommandsRegistry.create(...)` holds a `Map<string, CommandDeclaration>` and
a `Set<() => void>` of `onUpdate` subscribers. Variadic `.set(...)` is
atomic: keys are pre-checked for collision (different reference under same
key) before any entry is added; on collision a `RangeError` is thrown and
the map is unchanged. Idempotent re-registration (same reference) is a
no-op (no `onUpdate` fire). Composed / filtered / namespaced views hold no
state — subscribers and lookups delegate to the underlying source(s).

JSON Schema (`inputJsonSchema` / `outputJsonSchema`) is exposed as a lazy
`Promise<Record<string, unknown>>` getter on each declaration. The first
read triggers async vendor loading inside
`@standard-community/standard-json`; subsequent reads return the cached
Promise. This keeps the substrate validator-agnostic — Zod, Valibot,
ArkType, TypeBox, Effect Schema, Sury are all supported out of the box;
custom validators register via `loadVendor` from the bridge package.

### Constraints

- Listener-throw short-circuits dispatch. Observers registered after a
  buggy handler will not run if the handler throws or returns a rejecting
  promise. Register critical observers at a higher priority than handlers
  that might throw.
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

## License

MIT © statewalker
