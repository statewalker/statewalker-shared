# statewalker-shared

Foundation layer for the statewalker ecosystem — shared primitives, adapters, logger, registry, intents, ids.

## Packages

| Package | Description |
| --- | --- |
| [`@statewalker/shared-adapters`](packages/shared-adapters) | Adapter registration helpers (`newAdapter`, `newRegistry`). |
| [`@statewalker/shared-generators`](packages/shared-generators) | Async generator utilities (merge, take, batch). |
| [`@statewalker/shared-logger`](packages/shared-logger) | Logger interface + stdout implementation. |
| [`@statewalker/shared-logger-pino`](packages/shared-logger-pino) | Pino-backed production logger adapter. |
| [`@statewalker/shared-baseclass`](packages/shared-baseclass) | Proxy-based observable `BaseClass`. |
| [`@statewalker/shared-registry`](packages/shared-registry) | Lightweight service/model registry. |
| [`@statewalker/shared-intents`](packages/shared-intents) | Declarative intent primitives for cross-layer dispatch. |
| [`@statewalker/ids`](packages/ids) | Crockford base32, SHA1-UUID and related ID utilities. |

## Development

```sh
pnpm install
pnpm run build
pnpm run test
```

## Release

Releases are managed via [changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset           # describe the change
pnpm version-packages    # roll versions + regenerate CHANGELOGs
pnpm release-packages    # publish to npm
```

## History

The initial commit on `main` is a fresh template expansion; pre-split history is preserved as archaeology-only branches:

- `history/shared` — pre-split `workspaces/workspace-core/packages/shared/` history
- `history/ids` — pre-split `workspaces/workspace-core/packages/ids/` history
- `history/service-logger` — pre-split history for what is now `@statewalker/shared-logger-pino`

These branches are never merged into `main`; `git log` them when walking blame across the split.

## License

MIT — see `LICENSE`.
