# statewalker-shared

## What it is

A pnpm workspace of small foundation packages published to npm under
`@statewalker/*`: context adapters, an observable base class, async generator
helpers, a disposer registry, a logger interface with a pino backend, ID
utilities, a typed command bus, and typed extension-point slots. Every package
is public, ESM-only, and has at most a few runtime dependencies.

## Nine packages, two internal dependency edges

```
packages/
  shared-adapters      newAdapter / getAdapter: typed values on context objects
  shared-baseclass     BaseClass (onUpdate/notify), onChange, waitFor, readValues
  shared-commands      Commands bus, Command builder, CommandsRegistry
  shared-generators    newAsyncGenerator: callbacks -> async iterables
  shared-ids           SnowflakeId, snowflake parsing, Crockford base32, SHA-1
  shared-logger        Logger type, console logger, getLogger/setLogger
  shared-logger-pino   pino-backed Logger
  shared-registry      newRegistry: LIFO cleanup callbacks
  shared-slots         Slots bus, defineSlot / defineKeyedSlot

shared-logger-pino --> shared-logger --> shared-adapters
(every other package has no @statewalker dependency)
```

| Package | Description | npm |
| --- | --- | --- |
| [`@statewalker/shared-adapters`](packages/shared-adapters) | Typed get/set/remove helpers for values stored on plain context objects. | [npm](https://www.npmjs.com/package/@statewalker/shared-adapters) |
| [`@statewalker/shared-baseclass`](packages/shared-baseclass) | Minimal observable `BaseClass` plus `onChange`, `waitFor`, `readValues` helpers. | [npm](https://www.npmjs.com/package/@statewalker/shared-baseclass) |
| [`@statewalker/shared-commands`](packages/shared-commands) | Typed command bus and composable command registries. | [npm](https://www.npmjs.com/package/@statewalker/shared-commands) |
| [`@statewalker/shared-generators`](packages/shared-generators) | Bridge callback-style producers into async generators with backpressure and cleanup. | [npm](https://www.npmjs.com/package/@statewalker/shared-generators) |
| [`@statewalker/shared-ids`](packages/shared-ids) | Snowflake IDs in Crockford base32, snowflake parsing, SHA-1 hex digests. | [npm](https://www.npmjs.com/package/@statewalker/shared-ids) |
| [`@statewalker/shared-logger`](packages/shared-logger) | `Logger` interface, console implementation, `getLogger` / `setLogger` adapter. | [npm](https://www.npmjs.com/package/@statewalker/shared-logger) |
| [`@statewalker/shared-logger-pino`](packages/shared-logger-pino) | Pino-backed `Logger` implementation. | [npm](https://www.npmjs.com/package/@statewalker/shared-logger-pino) |
| [`@statewalker/shared-registry`](packages/shared-registry) | Register cleanup callbacks and run them in LIFO order. | [npm](https://www.npmjs.com/package/@statewalker/shared-registry) |
| [`@statewalker/shared-slots`](packages/shared-slots) | Typed pub/sub slots (plain and keyed) for extension points. | [npm](https://www.npmjs.com/package/@statewalker/shared-slots) |

## How to run it

Requires Node.js 24 and pnpm 10. The pnpm version is pinned in
`packageManager`; corepack picks it up.

1. `corepack enable`
2. `pnpm install`
3. `pnpm build` — builds every package with tsdown into `dist/`.
4. `pnpm typecheck` and `pnpm test` — run after the build (see below).
5. `pnpm lint:check` and `pnpm format:check` — the same checks CI runs.

CI (`.github/workflows/ci.yml`) runs, on pushes and pull requests to `main`:
`pnpm install --frozen-lockfile`, `lint:check`, `format:check`, `build`,
`typecheck`, `test`.

Packages are published to npm from CI with
[changesets](https://github.com/changesets/changesets): a "chore: version
packages" pull request collects pending version bumps, and merging it
publishes. Run `pnpm changeset` in a pull request to choose the bump level and
changelog text for a package yourself.

## Why it is the way it is

- **Packages export `dist/`, with a `source` condition.** Each package's
  single `.` export maps `types` to `dist/index.d.ts`, `import` / `default` to
  `dist/index.js`, and `source` to `src/index.ts`. Consumers get built
  JavaScript and declarations by default; tools that enable the `source`
  condition can resolve the TypeScript sources, which is why `src/` is in
  `files` next to `dist/`.
- **Builds are unbundled ESM** (`tsdown`, `unbundle: true`, ESM only, `.js` /
  `.d.ts` outputs to match `exports`), and every package sets
  `"sideEffects": false`, so bundlers can drop what a consumer does not import.
- **The logger is split in two.** `shared-logger` has no dependency besides
  `shared-adapters` and runs in browsers. `pino` and `pino-pretty` live only in
  `shared-logger-pino`, so only code that wants pino pulls them in.
- **Internal dependencies are `workspace:^`; external versions come from the
  pnpm catalog** in `pnpm-workspace.yaml` (`catalog:`), so one version of each
  tool is used across all packages.
- **`biome.json` is a root config.** Biome then applies the repository's
  formatting (2-space indent, 100 columns) and ignores what `.gitignore`
  lists, including `dist/`.

## What will surprise you

- **Typecheck fails on a fresh clone until you build.** A package sees its
  sibling's types through `dist/index.d.ts` (the `types` condition), not
  `src/`. Without a build, `pnpm typecheck` in `shared-logger` reports:

  ```
  src/logger.adapter.ts(2,28): error TS2307: Cannot find module '@statewalker/shared-adapters' or its corresponding type declarations.
  ```

  Run `pnpm build` first. CI runs `build` before `typecheck` for this reason.
- **`pnpm lint` and `pnpm format` write files.** Use `lint:check` and
  `format:check` to check without changes, as CI does.
- **`pnpm install --frozen-lockfile` fails when `pnpm-lock.yaml` is stale**
  (`ERR_PNPM_OUTDATED_LOCKFILE`). Run `pnpm install` and commit the updated
  lockfile together with the `package.json` change.
- **`publish-all` bypasses changesets.** It builds and runs
  `pnpm -r publish` directly, without version bumps or changelogs. Releases
  go through the changesets flow instead.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm build` | `pnpm -r run build` (tsdown in every package) |
| `pnpm test` | `pnpm -r run test` (vitest) |
| `pnpm typecheck` | `pnpm -r run typecheck` (`tsc --noEmit`) |
| `pnpm lint` | `biome check --write .` |
| `pnpm lint:check` | `biome check .` |
| `pnpm format` | `biome format --write .` |
| `pnpm format:check` | `biome format .` |
| `pnpm changeset` | add a changeset |
| `pnpm version-packages` | `changeset version` |
| `pnpm release-packages` | `changeset publish` |
| `pnpm publish-all` | build and `pnpm -r publish --access public --no-git-checks` |

Each package also has `dev` (`tsdown --watch`), `test:watch`, and `clean`.

### Files

| Path | Purpose |
| --- | --- |
| `pnpm-workspace.yaml` | workspace globs (`packages/*`, `apps/*`) and the dependency catalog |
| `biome.json` | lint and format configuration |
| `tsconfig.base.json` | base compiler options; not extended by the packages, each `packages/*/tsconfig.json` is self-contained |
| `turbo.json` | turbo task graph (`build` after dependencies' `build`); the root scripts use `pnpm -r`, which also builds in dependency order |
| `.changeset/config.json` | changesets configuration (public access, base branch `main`) |
| `.github/workflows/ci.yml` | CI checks |
| `.github/workflows/release.yml` | changesets release job on `main` |
| `packages/PACKAGE_README.template.md` | starting point for a new package README |
| `LICENSE` | MIT license for all packages |
