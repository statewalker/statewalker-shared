# @statewalker/shared-logger-pino

## What it is

A pino-backed implementation of the `@statewalker/shared-logger` `Logger`
interface. Exports a single default async function, `initServiceLogger(ctx)`,
that creates a pino instance, wraps it as a `Logger`, and binds it on the
context via `setLogger`.

## Why it exists

In production (Node services, workers), the default console logger from
`@statewalker/shared-logger` is too noisy and lacks structured output.
Swapping in pino gives structured JSON logs in production and pretty
colorised output in development — without changing any call site that uses
`getLogger(ctx)`.

This package is the integration boundary: it owns the pino dependency, the
pino transport configuration, and the multi-arg → pino metadata translation.

## How to use

```sh
pnpm add @statewalker/shared-logger-pino
```

```ts
import initServiceLogger from "@statewalker/shared-logger-pino";
import { getLogger } from "@statewalker/shared-logger";

const ctx: Record<string, unknown> = {};
await initServiceLogger(ctx);

const log = getLogger(ctx);
log.info("service started", { port: 3000 });
```

## Examples

### Bootstrap in a service entry point

```ts
import initServiceLogger from "@statewalker/shared-logger-pino";

export async function main() {
  const ctx: Record<string, unknown> = {};
  const shutdownLogger = await initServiceLogger(ctx);
  try {
    await runServer(ctx);
  } finally {
    await shutdownLogger();
  }
}
```

### Child logger with request metadata

```ts
const log = getLogger(ctx);
const reqLog = log.child({ requestId: req.id, userId: req.user?.id });
reqLog.info("incoming");
```

## Internals

### Transport selection

- `process.env.NODE_ENV === "production"` → plain pino JSON to stdout.
- Anything else (dev / test) → `pino-pretty` transport with colorised
  output and human-readable timestamps.

### Multi-argument translation

The `Logger` interface accepts varargs (`log.info(msg, extra1, extra2)`),
which pino does not. The wrapper folds extra args into `{ extra: ... }`
metadata: a single extra is passed as-is; multiple extras are collected
into an array. The first string argument is treated as the message; if
the first arg is not a string, the whole call is logged as
`{ args: [...] }`.

### Level field formatter

The pino formatters replace numeric level codes with the string label so
ingestion pipelines can filter by `level == "warn"` without remapping.

### Constraints

- The service-side init is async because pino's worker-thread transport
  initialisation is async. Always `await initServiceLogger(...)` before
  the first `getLogger(...)` call to ensure the pino instance — not the
  default console fallback — is installed on the context.
- The returned shutdown function is currently a noop. It exists so future
  versions can flush pino's worker transport without changing the call
  site.

### Dependencies

- `@statewalker/shared-logger` — `Logger` interface and adapter wiring.
- `pino` — log core.
- `pino-pretty` — dev transport.

## License

MIT — see the monorepo root `LICENSE`.
