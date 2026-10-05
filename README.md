# statewalker-shared

Foundation packages for the statewalker ecosystem: context adapters, an
observable base class, async generator helpers, a disposer registry, a logger
interface with a pino backend, ID utilities, a typed command bus, and typed
extension-point slots.

## Packages

All packages are public and published to npm under `@statewalker/*`.

| Package | Description | npm |
| --- | --- | --- |
| [`@statewalker/shared-adapters`](packages/shared-adapters) | Typed get/set/remove helpers (`newAdapter`, `getAdapter`) for values stored on plain context objects. | [npm](https://www.npmjs.com/package/@statewalker/shared-adapters) |
| [`@statewalker/shared-baseclass`](packages/shared-baseclass) | Minimal observable `BaseClass` (`onUpdate` / `notify`) plus `onChange`, `waitFor`, `readValues` helpers. | [npm](https://www.npmjs.com/package/@statewalker/shared-baseclass) |
| [`@statewalker/shared-commands`](packages/shared-commands) | Typed command bus (`Commands`) and composable command registries (`CommandsRegistry`). | [npm](https://www.npmjs.com/package/@statewalker/shared-commands) |
| [`@statewalker/shared-generators`](packages/shared-generators) | Bridge callback-style producers into async generators with backpressure and cleanup. | [npm](https://www.npmjs.com/package/@statewalker/shared-generators) |
| [`@statewalker/shared-ids`](packages/shared-ids) | Snowflake IDs in Crockford base32, snowflake parsing, SHA-1 hex digests. | [npm](https://www.npmjs.com/package/@statewalker/shared-ids) |
| [`@statewalker/shared-logger`](packages/shared-logger) | `Logger` interface, console implementation, and `getLogger` / `setLogger` context adapter. | [npm](https://www.npmjs.com/package/@statewalker/shared-logger) |
| [`@statewalker/shared-logger-pino`](packages/shared-logger-pino) | Pino-backed `Logger` implementation for `@statewalker/shared-logger`. | [npm](https://www.npmjs.com/package/@statewalker/shared-logger-pino) |
| [`@statewalker/shared-registry`](packages/shared-registry) | Disposer registry: register cleanup callbacks and run them in LIFO order. | [npm](https://www.npmjs.com/package/@statewalker/shared-registry) |
| [`@statewalker/shared-slots`](packages/shared-slots) | Typed pub/sub slots (plain and keyed) for extension points. | [npm](https://www.npmjs.com/package/@statewalker/shared-slots) |

Each package ships built ESM in `dist/` (with `.d.ts`) and its TypeScript
sources in `src/`. Each package has a single `.` export that points at
`dist/index.js`.

## Relation to other statewalker repositories

This repository depends on no other statewalker repository. Its only
`@statewalker/*` dependencies are its own packages (`workspace:^`):
`shared-logger` uses `shared-adapters`, and `shared-logger-pino` uses
`shared-logger`.

Other repositories consume these packages from npm, for example
statewalker-kernel, statewalker-ai, statewalker-shell-react,
statewalker-sandbox, httpeers and sandclaw.

## Requirements

- Node.js 24
- pnpm 10 (the version is pinned in `packageManager`; enable it with `corepack enable`)

## Development

```sh
corepack enable
pnpm install
pnpm build          # build every package (tsdown)
pnpm test           # run vitest in every package
pnpm typecheck      # tsc --noEmit in every package
pnpm lint           # biome check --write .
pnpm lint:check     # biome check . (no writes, as in CI)
pnpm format         # biome format --write .
pnpm format:check   # biome format . (no writes, as in CI)
```

Internal dependencies use `workspace:^`. External dependency versions live in
the pnpm catalog in `pnpm-workspace.yaml` and are referenced as `catalog:`.

CI (`.github/workflows/ci.yml`) runs a frozen install, lint check, format
check, build, typecheck and tests on pushes and pull requests to `main`.

## Releases

Releases use [changesets](https://github.com/changesets/changesets). After CI
passes on `main`, changesets are generated for packages whose packed contents
differ from what is on npm, and a "chore: version packages" pull request is
opened. Merging that pull request publishes the packages to npm with
provenance. To choose the bump level or changelog text yourself, add a
changeset in your pull request:

```sh
pnpm changeset
```

Dependency updates come from Renovate. The release and dependency workflow is
described in [statewalker/.github](https://github.com/statewalker/.github#readme).

## License

MIT. See [LICENSE](LICENSE).
