/**
 * Utility function transforming a sync callback notification to an async generator of values provided by the specified function.
 *
 * The callback is registered on the first `next()` and removed when the generator ends. `return()`
 * and `throw()` end the generator even while a `next()` is waiting for a notification: the pending
 * `next()` resolves `{ done: true }` and the callback is removed at once.
 *
 * @param onUpdate A function that registers a callback to be called whenever the object updates. It returns a cleanup function to unregister the callback.
 * @param read A function that returns a value to yield.
 * It is called whenever the update notification is received, and its result is yielded if it is not undefined.
 * @returns An async generator that yields provided values.
 */
export function readValues<R>(
  onUpdate: (callback: () => void) => () => void,
  read: () => R | undefined,
): AsyncGenerator<R> {
  let closed = false;
  let wakeUp: () => void = () => {};

  async function* run(): AsyncGenerator<R> {
    const cleanup = onUpdate(() => wakeUp());
    try {
      while (!closed) {
        const result = read();
        if (result !== undefined) {
          yield result;
        } else {
          await new Promise<void>((r) => {
            wakeUp = r;
          });
        }
      }
    } finally {
      wakeUp = () => {};
      cleanup();
    }
  }

  const gen = run();
  // A native async generator queues return()/throw() behind a pending next(), which never
  // settles while the source is idle. Wake the waiting loop first so it exits and runs cleanup.
  const close = () => {
    closed = true;
    wakeUp();
  };
  const genReturn = gen.return.bind(gen);
  const genThrow = gen.throw.bind(gen);
  gen.return = (value) => {
    close();
    return genReturn(value);
  };
  gen.throw = (error) => {
    close();
    return genThrow(error);
  };
  return gen;
}
