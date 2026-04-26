import type { Intent, IntentHandler, Intents } from "./types.js";

export type IntentRun<P, R> = (intents: Intents, payload: P) => Intent<P, R>;

export type IntentHandle<P, R> = (intents: Intents, handler: IntentHandler<P, R>) => () => void;

export function newIntent<P, R>(
  key: string,
  defaultHandler: IntentHandler<P, R> = () => true,
): [run: IntentRun<P, R>, handle: IntentHandle<P, R>] {
  function run(intents: Intents, payload: P): Intent<P, R> {
    return intents.run<P, R>(key, payload, defaultHandler);
  }

  function handle(intents: Intents, handler: IntentHandler<P, R>): () => void {
    return intents.addHandler<P, R>(key, handler);
  }

  return [run, handle];
}
