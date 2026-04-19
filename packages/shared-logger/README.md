# @statewalker/shared-logger

Logger interface and stdout-backed implementation for the statewalker runtime.

## Installation

```sh
pnpm add @statewalker/shared-logger
```

## Usage

```ts
import { getLoggerModel } from "@statewalker/shared-logger";

const log = getLoggerModel().logger("my-module");
log.info("hello %s", "world");
```

## API

- `LoggerModel`: adapter contract for acquiring named loggers.
- `getLoggerModel()`: resolve the current logger model from the ambient registry.
- `createStdoutLogger()`: minimal stdout implementation for tests and CLIs.

## Related

- `@statewalker/shared-logger-pino` — production pino-backed implementation.
- `@statewalker/shared-adapters` — the adapter infrastructure this package plugs into.

## License

MIT — see the monorepo root `LICENSE`.
