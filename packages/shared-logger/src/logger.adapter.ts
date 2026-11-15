import { newAdapter } from "@statewalker/shared-adapters";

const Levels = {
  fatal: 5,
  error: 4,
  warn: 3,
  info: 2,
  debug: 1,
  trace: 0,
} as const;

export type LoggerLevel = keyof typeof Levels;

export type Logger = {
  level: LoggerLevel;
  fatal: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  child: (metadata: Record<string, unknown>) => Logger;
};

export function newConsoleLogger(
  logLevel: LoggerLevel = "info",
  metadata: Record<string, unknown> = {},
): Logger {
  let rowCounter = 0;
  return newLogger(metadata);

  function newLogger(metadata: Record<string, unknown> = {}): Logger {
    const newWriter = (
      method: "trace" | "debug" | "info" | "warn" | "error",
      level: LoggerLevel = method,
    ) => {
      const prefix = `[${level.toUpperCase()}]`.padStart(7, " ");
      return (...args: unknown[]) => {
        if (Levels[logLevel] > Levels[level]) {
          return;
        }
        console[method](`[${String(rowCounter++).padStart(7, "0")}]${prefix}`, ...args, metadata);
      };
    };
    const logger: Logger = {
      get level() {
        return logLevel;
      },
      set level(newLevel: LoggerLevel) {
        if (!isLoggerLevel(newLevel)) {
          throw new Error(`Unknown log level: ${newLevel}`);
        }
        logLevel = newLevel;
      },
      info: newWriter("info"),
      debug: newWriter("debug"),
      trace: newWriter("trace"),
      warn: newWriter("warn"),
      error: newWriter("error"),
      fatal: newWriter("error", "fatal"),
      child: (newMetadata) => newLogger({ ...metadata, ...newMetadata }),
    };
    return logger;
  }
}

function isLoggerLevel(value: unknown): value is LoggerLevel {
  return typeof value === "string" && Object.hasOwn(Levels, value);
}

function newProcessId(): string {
  // Self-typed: `crypto` is a global in browsers and Node 19+, but this file must
  // compile without DOM or node types. `randomUUID` is missing in insecure browser
  // contexts (plain http), hence the fallback.
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.floor(Math.random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, "0");
}

export function getProcessId(context: Record<string, unknown>): string {
  const key = "app.processId";
  context[key] = context[key] || newProcessId();
  return context[key] as string;
}

export const [getLogger, setLogger, removeLogger] = newAdapter<Logger, Record<string, unknown>>(
  "app.logger",
  (context) => {
    const logger = newConsoleLogger("warn").child({
      processId: getProcessId(context),
    });
    // Self-typed access: this package is source-consumed by host-neutral packages whose
    // tsconfig lacks node types, and `process` is absent in the browser — guard both.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    const requested = (env?.LOG_LEVEL || "info").toLowerCase();
    const logLevel: LoggerLevel = isLoggerLevel(requested) ? requested : "info";
    logger.level = logLevel;
    if (logLevel !== requested) {
      logger.warn(`[shared-logger] Unknown LOG_LEVEL "${env?.LOG_LEVEL}", using "info"`);
    }
    logger.info(`[shared-logger] Starting up with log level: ${logLevel}`);
    return logger;
  },
  () => undefined,
);
