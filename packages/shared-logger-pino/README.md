# @statewalker/shared-logger-pino

Pino-backed production logger adapter for the `@statewalker/shared-logger` interface.

## Installation

```sh
pnpm add @statewalker/shared-logger-pino
```

## Usage

```ts
import { createPinoLoggerModel } from "@statewalker/shared-logger-pino";
import { registerLoggerModel } from "@statewalker/shared-logger";

registerLoggerModel(createPinoLoggerModel({ level: "info" }));
```

## API

- `createPinoLoggerModel(options)`: instantiate a `LoggerModel` backed by pino.
- `pinoPretty` transport enablement is handled by the consumer's pino config.

## Related

- `@statewalker/shared-logger` — logger interface this adapter implements.

## License

MIT — see the monorepo root `LICENSE`.
