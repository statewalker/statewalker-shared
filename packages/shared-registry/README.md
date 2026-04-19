# @statewalker/shared-registry

Lightweight service/model registry shared across the statewalker backbone.

## Installation

```sh
pnpm add @statewalker/shared-registry
```

## Usage

```ts
import { createRegistry } from "@statewalker/shared-registry";

const registry = createRegistry();
registry.set("my.service", { start() {} });
const svc = registry.get("my.service");
```

## API

- `createRegistry()`: return a new string-keyed registry with `get`/`set`/`has`/`keys`.

## Related

- `@statewalker/shared-adapters` — typed adapter descriptors commonly stored in a registry.

## License

MIT — see the monorepo root `LICENSE`.
