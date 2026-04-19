# @statewalker/ids

Crockford base32, SHA1-UUID and related ID utilities for deterministic identifiers.

## Installation

```sh
pnpm add @statewalker/ids
```

## Usage

```ts
import { encodeCrockford, sha1Uuid } from "@statewalker/ids";

const id = encodeCrockford(Buffer.from("hello"));
const uuid = await sha1Uuid("my-namespace", "my-input");
```

## API

- `encodeCrockford`/`decodeCrockford`: Crockford-base32 codec.
- `sha1Uuid(namespace, input)`: deterministic UUID v5-style SHA-1 UUID.

## Related

- `@statewalker/shared-adapters` — commonly depends on stable ID generation.

## License

MIT — see the monorepo root `LICENSE`.
