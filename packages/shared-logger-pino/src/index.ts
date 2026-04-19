import type { Logger, LoggerLevel } from "@statewalker/shared-logger";
import { getProcessId, setLogger } from "@statewalker/shared-logger";
import pino from "pino";

function newPinoLogger(
  level: LoggerLevel,
  metadata: Record<string, unknown> = {},
): Logger {
  const pinoInstance = pino({
    level,
    ...(process.env.NODE_ENV !== "production" && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }),
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return wrapPino(pinoInstance, metadata);
}

function wrapPino(
  instance: pino.Logger,
  metadata: Record<string, unknown>,
): Logger {
  const bound =
    Object.keys(metadata).length > 0 ? instance.child(metadata) : instance;
  return {
    get level() {
      return bound.level as LoggerLevel;
    },
    set level(newLevel: LoggerLevel) {
      bound.level = newLevel;
    },
    fatal: (...args: unknown[]) => log(bound, "fatal", args),
    error: (...args: unknown[]) => log(bound, "error", args),
    warn: (...args: unknown[]) => log(bound, "warn", args),
    info: (...args: unknown[]) => log(bound, "info", args),
    debug: (...args: unknown[]) => log(bound, "debug", args),
    trace: (...args: unknown[]) => log(bound, "trace", args),
    child: (newMetadata) => wrapPino(bound, newMetadata),
  };
}

function log(instance: pino.Logger, level: LoggerLevel, args: unknown[]) {
  if (args.length === 0) return;
  if (args.length === 1) {
    instance[level](args[0]);
    return;
  }
  const [first, ...rest] = args;
  if (typeof first === "string") {
    instance[level]({ extra: rest.length === 1 ? rest[0] : rest }, first);
  } else {
    instance[level]({ args });
  }
}

export default async function initServiceLogger(
  context: Record<string, unknown>,
): Promise<() => Promise<void>> {
  const level = (process.env.LOG_LEVEL ?? "info") as LoggerLevel;
  const logger = newPinoLogger(level, { processId: getProcessId(context) });
  setLogger(context, logger);
  logger.info("[service-logger] Pino logger initialized");
  context.logger = logger.info;
  return async () => {};
}
