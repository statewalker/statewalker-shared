import { newAsyncGenerator } from "./new-async-generator.js";

export function newAsyncGeneratorFunction<T>(
  listen: (next: (value: T) => void) => undefined | (() => void),
): () => AsyncGenerator<T> {
  // Return the generator itself (not a `yield*` wrapper) so that `return()` on a
  // waiting consumer reaches it and settles the pending `next()`.
  return () => newAsyncGenerator(listen);
}
