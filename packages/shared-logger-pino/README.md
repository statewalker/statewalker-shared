# @statewalker/shared-logger-pino

A [pino](https://getpino.io)-backed implementation of the `Logger` interface
from [`@statewalker/shared-logger`](../shared-logger). Code that calls
`getLogger(ctx)` keeps working unchanged; it gets structured pino output
instead of the console logger. On Node it writes JSON in production and
pretty, colorized lines (via `pino-pretty`) otherwise. In browsers and workers
it uses pino's browser build, which logs to `console`.

## Installation

```sh
pnpm add @statewalker/shared-logger-pino @statewalker/shared-logger
```

`pino` and `pino-pretty` are regular dependencies and are installed with the
package. `@statewalker/shared-logger` is also a dependency; add it directly
when you import `getLogger` from it, as in the examples.

## Entry points

One entry point, `@statewalker/shared-logger-pino` (ESM, `dist/index.js` with
types):

- default export `initServiceLogger(ctx)` — creates a pino logger and installs
  it on the context.
- named export `newPinoLogger(level, metadata?, options?)` — creates a pino
  logger without installing it.

## Usage

```ts
import initServiceLogger from "@statewalker/shared-logger-pino";
import { getLogger } from "@statewalker/shared-logger";

const ctx: Record<string, unknown> = {};
const shutdownLogger = await initServiceLogger(ctx);

const log = getLogger(ctx);
log.info("service started", { port: 3000 });

const reqLog = log.child({ requestId: "req-42" });
reqLog.info("incoming");

await shutdownLogger();
```

Send logs to stderr, for example in a CLI that keeps stdout for data:

```ts
import { setLogger } from "@statewalker/shared-logger";
import { newPinoLogger } from "@statewalker/shared-logger-pino";

setLogger(ctx, newPinoLogger("info", { component: "cli" }, { destination: 2 }));
```

## API

### `initServiceLogger(ctx): Promise<() => Promise<void>>` (default export)

- Reads the level from `process.env.LOG_LEVEL` (default `info`).
- Calls `newPinoLogger(level, { processId: getProcessId(ctx) })` and installs
  the result with `setLogger(ctx, logger)`.
- Logs `[service-logger] Pino logger initialized` at `info`.
- Also sets `ctx.logger` to the logger's `info` function.
- Returns a shutdown function. It currently does nothing; call it anyway so
  that later versions can flush output.

It reads `process.env`, so call it on Node. In browsers, use `newPinoLogger`
with `setLogger` instead.

### `newPinoLogger(level, metadata = {}, options = {}): Logger`

- `level` — a `LoggerLevel` (`trace` … `fatal`).
- `metadata` — bound to every line (pino child bindings).
- `options.destination` — `1` (stdout, default) or `2` (stderr). Node only.

On Node, `NODE_ENV === "production"` gives plain pino JSON written to the
destination; any other value uses the `pino-pretty` transport (colorized,
`HH:MM:ss` timestamps, `pid` and `hostname` hidden). Levels are written as
string labels (`"level": "warn"`) and timestamps as ISO strings.

In browsers and workers it returns a logger based on
`pino({ level, browser: { asObject: true } })` and does not touch `process`,
transports or file descriptors.

## Argument mapping

The `Logger` interface takes any arguments; pino takes an optional object and
a message. The wrapper maps them like this:

- one argument: passed to pino as is;
- several arguments with a string first: the string is the message, the rest
  goes to `{ extra }` (a single value, or an array for several);
- several arguments with a non-string first: logged as `{ args: [...] }`;
- no arguments: nothing is logged.

## Related

- [`@statewalker/shared-logger`](../shared-logger) — `Logger` interface,
  console logger, `getLogger` / `setLogger`.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
