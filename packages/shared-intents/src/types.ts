export interface Intent<P, R> {
  key: string;
  payload: P;
  handled: boolean;
  settled: boolean;
  resolve(result: R): void;
  reject(error: unknown): void;
  promise: Promise<R>;
}

export type IntentHandler<P = unknown, R = unknown> = (intent: Intent<P, R>) => boolean;

export interface Intents {
  run<P, R>(key: string, payload: P, defaultHandler?: IntentHandler<P, R>): Intent<P, R>;
  addHandler<P, R>(key: string, handler: IntentHandler<P, R>): () => void;
}
