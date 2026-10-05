# @statewalker/shared-logger-pino

## What it is

A [pino](https://getpino.io)-backed implementation of the `Logger` interface
from `@statewalker/shared-logger`. `initServiceLogger(ctx)` creates a pino
logger and installs it on a context with `setLogger`, so code that calls
`getLogger(ctx)` gets pino output without changes. `newPinoLogger(...)`
creates one without installing it.

## Why it exists

The console logger in `@statewalker/shared-logger` prints unstructured lines.
Services need structured JSON in production and readable, colorized output
during development. This package adds that behind the same `Logger`
interface and keeps `pino` and `pino-pretty` out of
`@statewalker/shared-logger`, which stays dependency-light and browser-safe.

## How to use

```sh
pnpm add @statewalker/shared-logger-pino @statewalker/shared-logger
```

`pino` and `pino-pretty` are installed as dependencies of this package.
`@statewalker/shared-logger` is a dependency too; add it directly when you
import from it (`getLogger`, `setLogger`), as below.

### Entry point

One entry point, `@statewalker/shared-logger-pino` (ESM, `dist/index.js` with
types):

- default export `initServiceLogger(ctx): Promise<() => Promise<void>>` —
  reads `process.env.LOG_LEVEL` (default `info`), creates
  `newPinoLogger(level, { processId: getProcessId(ctx) })`, installs it with
  `setLogger`, logs `[service-logger] Pino logger initialized`, sets
  `ctx.logger` to the logger's `info` function, and returns a shutdown
  function.
- named export `newPinoLogger(level, metadata = {}, options = {}): Logger` —
  `metadata` is bound to every line; `options.destination` is `1` (stdout,
  default) or `2` (stderr).

```ts
import initServiceLogger from "@statewalker/shared-logger-pino";
import { getLogger } from "@statewalker/shared-logger";

const ctx: Record<string, unknown> = {};
const shutdownLogger = await initServiceLogger(ctx);

getLogger(ctx).info("service started", { port: 3000 });

await shutdownLogger();
```

## Examples

### Child logger with request metadata

```ts
import initServiceLogger from "@statewalker/shared-logger-pino";
import { getLogger } from "@statewalker/shared-logger";

const ctx: Record<string, unknown> = {};
await initServiceLogger(ctx);

const reqLog = getLogger(ctx).child({ requestId: "req-42" });
reqLog.info("incoming"); // requestId and processId are on the line
```

### Logs on stderr, data on stdout

A command-line tool can keep stdout for machine-readable output:

```ts
import { setLogger } from "@statewalker/shared-logger";
import { newPinoLogger } from "@statewalker/shared-logger-pino";

const ctx: Record<string, unknown> = {};
setLogger(ctx, newPinoLogger("info", { component: "cli" }, { destination: 2 }));
```

## Internals

### Output depends on the runtime and `NODE_ENV`

```
Node, NODE_ENV === "production"  -> pino JSON written to fd 1 or 2
Node, any other NODE_ENV         -> pino-pretty transport (colorized,
                                    HH:MM:ss, pid/hostname hidden)
browser / worker (no process.versions.node)
                                 -> pino browser build, objects to console
```

On Node, levels are written as labels (`"level": "warn"`, not `40`) and
timestamps as ISO strings, so log pipelines can filter on the label without a
mapping table. In browsers the logger never touches `process`, transports or
file descriptors, because they do not exist there.

### How `Logger` arguments map to pino

The `Logger` interface takes any arguments; pino takes an optional object and
a message.

- one argument: passed to pino unchanged;
- several arguments with a string first: the string is the message, the rest
  goes to `{ extra }` (one value as is, several as an array);
- several arguments with a non-string first: logged as `{ args: [...] }`;
- no arguments: nothing is logged.

### Constraints

- `initServiceLogger` reads `process.env` and so works only where `process`
  exists (Node). In a browser, call `newPinoLogger` and `setLogger` yourself.
- Call `initServiceLogger(ctx)` before the first `getLogger(ctx)`. If
  `getLogger` runs first, it caches the console logger on the context, and
  that logger stays in use until `setLogger` replaces it.
- An unknown `LOG_LEVEL` is passed to pino, which throws at creation time
  (`Error: default level:bogus must be included in custom levels`).
- The shutdown function returned by `initServiceLogger` does nothing yet.
  Call it anyway so that flushing can be added without changing callers.
- `ctx.logger` is overwritten with the logger's `info` function.

### Dependencies

- `@statewalker/shared-logger` — the `Logger` type, `setLogger`,
  `getProcessId`.
- `pino` — the logger.
- `pino-pretty` — the development transport on Node.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
