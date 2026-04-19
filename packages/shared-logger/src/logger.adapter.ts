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
        console[method](
          `[${String(rowCounter++).padStart(7, "0")}]${prefix}`,
          ...args,
          metadata,
        );
      };
    };
    const logger: Logger = {
      get level() {
        return logLevel;
      },
      set level(newLevel: LoggerLevel) {
        if (Levels[newLevel] === undefined) {
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

export function getProcessId(context: Record<string, unknown>): string {
  const key = "app.processId";
  context[key] = context[key] || Math.random().toString(16).slice(8);
  return context[key] as string;
}

export const [getLogger, setLogger, removeLogger] = newAdapter<
  Logger,
  Record<string, unknown>
>(
  "app.logger",
  (context) => {
    const logger = newConsoleLogger("warn").child({
      processId: getProcessId(context),
    });
    const logLevel = (process.env.LOG_LEVEL ?? "info") as LoggerLevel;
    logger.level = logLevel;
    logger.info(`[backbone] Starting up with log level: ${logLevel}`);
    return logger;
  },
  () => undefined,
);

// export function getLogger(context: Record<string, unknown>): Logger {
//   const stack = (context['fsm:states'] || []) as string[];
//   const event = (context['fsm:event'] ?? '') as string;
//   return getRootLogger(context).child({
//     processId: getProcessId(context),
//     stack,
//     event,
//   });
// }
