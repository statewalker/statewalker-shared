import { newAsyncGenerator } from "@statewalker/shared-generators";

/**
 * Utility function transforming a sync callback notification to an async generator of values provided by the specified function.
 *
 * Built on `newAsyncGenerator` from `@statewalker/shared-generators`, the one callback-to-async
 * bridge; use that directly for producers that push values. `readValues` adds the pull rule: it
 * calls `read` when the consumer is ready for a value, yields its result while it is defined, and
 * otherwise waits for the next notification.
 *
 * The callback is registered on the first `next()` and removed when the generator ends. `return()`
 * and `throw()` end the generator even while a `next()` is waiting for a notification: the pending
 * `next()` resolves `{ done: true }`, the callback is removed, and `read` is not called again.
 * If `read` throws, the generator ends with that error: the consumer's `next()` rejects with it
 * and the callback is removed.
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

  const gen = newAsyncGenerator<R>((next, done) => {
    let pumping = false;
    let notified = false;
    // Reads and hands over values until `read` returns undefined; each
    // `next(value)` resolves once the consumer asks for the following one.
    const pump = async () => {
      notified = true;
      if (pumping) return;
      pumping = true;
      try {
        while (notified && !closed) {
          notified = false;
          for (let value = read(); value !== undefined; value = closed ? undefined : read()) {
            if (!(await next(value))) return;
          }
        }
      } catch (error) {
        // A throwing `read` ends the generator: the consumer's `next()`
        // rejects with the error and the callback is removed.
        closed = true;
        void done(error as Error);
      } finally {
        pumping = false;
      }
    };
    const unsubscribe = onUpdate(() => {
      if (!closed) void pump();
    });
    void pump();
    return () => {
      closed = true;
      unsubscribe();
    };
  });

  // Mark the generator closed synchronously, so a notification arriving
  // while `return()` / `throw()` is in flight reads nothing.
  const genReturn = gen.return.bind(gen);
  gen.return = (value) => {
    closed = true;
    return genReturn(value);
  };
  gen.throw = async (error) => {
    closed = true;
    await genReturn(undefined);
    throw error;
  };
  return gen;
}
