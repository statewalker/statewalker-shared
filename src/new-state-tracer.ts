import { getLogger, type LoggerLevel } from "./logger.adapter.js";

export function newStateTracer(level: LoggerLevel = "info") {
  // let stateCounter = 0;
  return async (context: Record<string, unknown>) => {
    // const stateId = stateCounter++; // String(stateCounter++).padStart(5, "0");
    const logger = getLogger(context);
    const stack = (context["fsm:states"] || []) as string[];
    const event = context["fsm:event"] ?? "";
    const path = stack.map(() => " ").join("");
    const state = stack[stack.length - 1] || "";
    logger[level](`${path}<${state} event="${event}">`);
    return () => {
      logger[level](`${path}</${state}>`);
    };
  };
}
