# @statewalker/shared-generators

Async generator utilities used by statewalker runtime helpers.

## Installation

```sh
pnpm add @statewalker/shared-generators
```

## Usage

```ts
import { merge, take } from "@statewalker/shared-generators";

const out = merge(source1(), source2());
for await (const event of take(out, 10)) {
  console.log(event);
}
```

## API

See exported symbols in `src/index.ts`. Utilities cover merging, taking, batching, and lifecycle primitives for async iterables.

## Related

- `@statewalker/shared-intents` — event/intent primitives that flow through these generators.

## License

MIT — see the monorepo root `LICENSE`.
