# @statewalker/shared-logger

## What it is

A minimal `Logger` interface (`trace` / `debug` / `info` / `warn` / `error` /
`fatal` / `child` / `level`), a default console-backed implementation, and a
context adapter (`getLogger` / `setLogger`) for sharing one logger instance
across consumers.

Also ships `newStateTracer` — a tiny utility that emits indented open/close
log tags for FSM-style state stacks.

## Why it exists

A shared logging convention without forcing a specific backend. Production
deployments swap in their own implementation via `setLogger`, browser
contexts keep the console default, tests inject a quiet mock — all behind
one interface and one adapter key. `newConsoleLogger` is a self-contained
fallback so code that calls `getLogger` works out of the box without the
consumer wiring anything up.

## How to use

```sh
pnpm add @statewalker/shared-logger
```

```ts
import { getLogger } from "@statewalker/shared-logger";

const ctx: Record<string, unknown> = {};
const log = getLogger(ctx); // auto-creates a console logger on first call
log.info("starting up");
log.error("bad thing", { code: 500 });
```

### Entry point

One entry point, `@statewalker/shared-logger` (ESM, `dist/index.js` with
types). Works in browsers, Node and workers.

### API surface

- `Logger` — type with `level`, `trace`, `debug`, `info`, `warn`, `error`,
  `fatal`, `child(metadata)`.
- `LoggerLevel` — `"trace" | "debug" | "info" | "warn" | "error" | "fatal"`.
- `newConsoleLogger(level = "info", metadata = {})` — console implementation.
  Each line is prefixed with a row counter and the level; `metadata` is
  appended as the last argument.
- `getLogger(ctx, optional?)`, `setLogger(ctx, logger)`, `removeLogger(ctx)` —
  context adapter.
- `getProcessId(ctx)` — random ID stored on the context, used as `processId`
  metadata.
- `newStateTracer(level = "info")` — returns `async (ctx) => close`; see
  below.

## Examples

### Inject a custom logger

```ts
import { newConsoleLogger, setLogger } from "@statewalker/shared-logger";

setLogger(ctx, newConsoleLogger("warn", { service: "ingest" }));
```

### Child logger with extra metadata

```ts
const log = getLogger(ctx);
const child = log.child({ requestId: "req-42" });
child.info("handling request");
```

### Trace FSM transitions

```ts
import { newStateTracer } from "@statewalker/shared-logger";

const trace = newStateTracer("debug");
const close = await trace(ctx);
// … run state body …
close();
```

## Internals

### Levels

```
trace < debug < info < warn < error < fatal
```

A call at level *L* is emitted iff `logLevels[loggerLevel] <= logLevels[L]`.
`fatal` routes through `console.error` with a `[FATAL]` tag because the
browser console has no separate fatal channel.

### Adapter contract

`getLogger` / `setLogger` / `removeLogger` are built with `newAdapter` from
`@statewalker/shared-adapters` under the key `app.logger`. They do not walk
parent contexts. When no logger is set, `getLogger(ctx)` creates a console
logger, sets its level from `process.env.LOG_LEVEL` (default `info`; the
`process` lookup is guarded, so this also works in browsers), binds a
`processId` stored on the context under `app.processId` (see
`getProcessId`), and logs one `info` start-up line. To use another backend,
call `setLogger(ctx, …)` before any code calls `getLogger`.

### State tracer format

Each call to the tracer emits `{indent}<{state} event="{event}">` on
entry and `{indent}</{state}>` on exit, where the indent is one space per
state-stack depth read from `ctx["fsm:states"]`. The format is grep-friendly
and renders as a tree in any text viewer.

### Constraints

- The default factory reads `process.env.LOG_LEVEL` when it creates the
  logger for a context. Subsequent env changes do not affect already-created
  loggers; mutate `logger.level` directly to change level at runtime.
- Setting `logger.level` on a console logger to an unknown name throws
  `Error: Unknown log level: <name>`. An invalid `LOG_LEVEL` value reaches
  the same setter, so `getLogger(ctx)` throws it on first use.
- `Logger` is intentionally minimal — no log destinations, no formatting
  configuration, no async drain. A pino backend ships separately as
  [`@statewalker/shared-logger-pino`](../shared-logger-pino).

### Dependencies

- `@statewalker/shared-adapters` — for the context adapter.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
