# @statewalker/shared-adapters

Adapter registration helpers (`newAdapter`, `newRegistry`) for discoverable service interfaces in the statewalker backbone.

## Installation

```sh
pnpm add @statewalker/shared-adapters
```

## Usage

```ts
import { newAdapter, newRegistry } from "@statewalker/shared-adapters";

const registry = newRegistry();
const MyAdapter = newAdapter<{ run(): void }>("my:adapter");

registry.register(MyAdapter, { run: () => {} });
const impl = registry.resolve(MyAdapter);
impl.run();
```

## API

- `newAdapter<T>(key: string)`: create an adapter descriptor keyed by `domain:name`.
- `newRegistry()`: create a registry that maps adapter descriptors to implementations.
- `AdapterRegistry.register/resolve`: register an implementation, resolve it at callsite.

## Related

- `@statewalker/shared-registry` — lightweight service/model registry built on top of adapters.

## License

MIT — see the monorepo root `LICENSE`.
