import type { Intent, IntentHandler, Intents } from "./types.js";

export function createIntents(): Intents {
  const handlers = new Map<string, Set<IntentHandler>>();

  function run<P, R>(key: string, payload: P): Promise<R> {
    let resolveFn!: (result: R) => void;
    let rejectFn!: (error: unknown) => void;

    const promise = new Promise<R>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const intent: Intent<P, R> = {
      key,
      payload,
      handled: false,
      settled: false,
      resolve(result: R) {
        if (intent.settled) return;
        intent.settled = true;
        resolveFn(result);
      },
      reject(error: unknown) {
        if (intent.settled) return;
        intent.settled = true;
        rejectFn(error);
      },
      promise,
    };

    const keyHandlers = handlers.get(key);
    if (keyHandlers) {
      for (const handler of keyHandlers) {
        const claimed = (handler as IntentHandler<P, R>)(intent);
        if (claimed) {
          intent.handled = true;
          break;
        }
      }
    }

    if (!intent.handled) {
      intent.settled = true;
      rejectFn(new Error(`Unhandled intent: ${key}`));
    }

    return promise;
  }

  function addHandler<P, R>(key: string, handler: IntentHandler<P, R>): () => void {
    let set = handlers.get(key);
    if (!set) {
      set = new Set();
      handlers.set(key, set);
    }
    const h = handler as IntentHandler;
    set.add(h);

    return () => {
      const s = handlers.get(key);
      if (s) {
        s.delete(h);
        if (s.size === 0) handlers.delete(key);
      }
    };
  }

  return { run, addHandler };
}
