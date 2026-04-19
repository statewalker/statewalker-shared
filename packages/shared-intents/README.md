# @statewalker/shared-intents

Declarative intent primitives for cross-layer command dispatch.

## Installation

```sh
pnpm add @statewalker/shared-intents
```

## Usage

```ts
import { defineIntent } from "@statewalker/shared-intents";

const OpenFile = defineIntent<{ path: string }>("file:open");
dispatch(OpenFile, { path: "README.md" });
```

## API

- `defineIntent<P>(name)`: declare a typed intent by stable name.
- `dispatch(intent, payload)`: dispatch to the currently registered handler.

## Related

- `@statewalker/shared-adapters` — the adapter infrastructure typically used to wire intent handlers.

## License

MIT — see the monorepo root `LICENSE`.
