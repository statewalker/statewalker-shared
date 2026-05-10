# @statewalker/shared-commands

Typed command bus for cross-fragment late binding.

## What it is

A workspace-scoped bus that lets fragments dispatch typed RPC requests
without importing each other. One fragment **declares** a command via
`defineCommand(key)`; another fragment **listens** for it; the
declaring fragment (or a third party) **calls** it.

Implements the GoF Command pattern with a richer lifecycle than VS
Code-style commands: three-state (`pending → handled → settled`),
multi-listener with first-claim-wins, and per-declaration default
fallback.

## Installation

```sh
pnpm add @statewalker/shared-commands
```

## Usage

### Declare a command

```ts
import { defineCommand } from "@statewalker/shared-commands";

export interface PickFilePayload { multiple?: boolean }
export interface PickFileResult  { blobs: Blob[] }

export const PickFileCommand =
  defineCommand<PickFilePayload, PickFileResult>("platform:pick-file");
```

### Dispatch a command

```ts
import { Commands } from "@statewalker/shared-commands";

const commands = workspace.requireAdapter(Commands);
const cmd = commands.call(PickFileCommand, { multiple: true });
const { blobs } = await cmd.promise;
```

### Listen for a command

```ts
commands.listen(PickFileCommand, (cmd) => {
  // Async work returning a Promise → claim + settle
  return showOpenFilePicker({ multiple: cmd.payload.multiple })
    .then(async (handles) => ({
      blobs: await Promise.all(handles.map((h) => h.getFile())),
    }));
});
```

A listener may also:
- Return `true` to claim without settling (caller settles later via
  `cmd.resolve` / `cmd.reject` — useful for dialog-attached commands).
- Return `void` / `undefined` to observe without claiming.
- Call `cmd.resolve(value)` / `cmd.reject(err)` directly.

## Dispatch lifecycle

For one `commands.call(decl, payload)`:

1. Bus constructs a `Command<P, R>`.
2. All registered listeners are invoked synchronously in registration
   order with `(cmd)`.
3. Per-listener claim detection: `true` / `Promise<R>` / direct
   `cmd.resolve` / `cmd.reject` → claimed. `void` → observer.
4. **All listeners are notified regardless of who claimed.**
5. After listener pass, if no listener claimed, `decl.defaultFn` runs
   (if set). May resolve, reject, throw, or leave pending.
6. If no listener claimed and no `defaultFn`, the bus rejects with
   `Unhandled command: <key>`.

The settled-guard ensures only the first `resolve` / `reject` wins;
later settles no-op.

## Default fallback

```ts
// loud-fail (default): no listener + no default → reject "Unhandled command: <key>"
const FooCommand = defineCommand<P, R>("foo");

// silent-pending opt-in: bus marks handled, leaves pending; caller settles externally
const FooCommand = defineCommand<P, R>("foo", () => {});

// resolve to a fallback value if nobody claimed
const FooCommand = defineCommand<P, R>("foo", () => fallbackValue);
```

## API

- `defineCommand<P, R>(key, defaultFn?)` — returns a frozen
  `CommandDeclaration<P, R>`.
- `commands.call(decl, payload)` — dispatches and returns a `Command<P, R>`.
- `commands.listen(decl, fn)` — registers a listener; returns a disposer.
- `Command<P, R>` — `{ key, payload, handled, settled, resolve, reject, promise }`.

## Workspace scoping

The `Commands` class is registered on the workspace as an adapter.
**One workspace = one bus**: any listener registered by one fragment
is observable by every other fragment in the same composition. Direct
`new Commands()` is supported for tests only.

## License

MIT — see the monorepo root `LICENSE`.
