import { newAsyncGenerator } from "./new-async-generator.js";

export function newAsyncGeneratorFunction<T>(
  listen: (next: (value: T) => void) => undefined | (() => void),
): () => AsyncGenerator<T> {
  return async function* () {
    yield* newAsyncGenerator(listen);
  };
}
