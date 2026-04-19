# @statewalker/shared-baseclass

Proxy-based observable `BaseClass` with automatic notification on property mutation.

## Installation

```sh
pnpm add @statewalker/shared-baseclass
```

## Usage

```ts
import { BaseClass } from "@statewalker/shared-baseclass";

class Counter extends BaseClass {
  count = 0;
}

const c = new Counter();
c.onChange((key) => console.log("changed", key));
c.count = 1;
```

## API

- `BaseClass`: Proxy-wrapped base with `onChange` and `notify` semantics.

## Related

- `@statewalker/shared-registry` — model registry that commonly holds BaseClass instances.

## License

MIT — see the monorepo root `LICENSE`.
