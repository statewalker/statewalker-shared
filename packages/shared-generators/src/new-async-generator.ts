/** Cleanup callback that `init` may return. */
export type AsyncGeneratorCleanup = () => void | Promise<void>;

/**
 * The newAsyncGenerator function creates async generators from callback-based initialization
 * functions, providing a bridge between imperative event handling and declarative async
 * iteration patterns.
 *
 * The initialization function receives two callback functions that control the generator's
 * behavior. The `next` function yields values to consumers, while the `done` function
 * signals completion or error conditions. The initialization function can return a cleanup
 * function that will be called when the generator is closed or an error occurs.
 *
 * The generator manages an internal queue of values and completion signals, ensuring that
 * producers can yield values without overwhelming consumers. Proper backpressure is implemented
 * by having the `next` and `done` functions return promises that resolve only after the
 * consumer has processed the values. This prevents memory leaks and ensures that producers
 * are aware of whether their values were successfully handled.
 * The generator also handles cleanup by draining any remaining items in the queue and notifying
 * producers that their values were not processed if the generator is closed early. This ensures
 * that resources are properly managed and that no memory leaks occur.
 *
 * Example usage:
 * ```typescript
 * const asyncGen = newAsyncGenerator<number>((next, done) => {
 *   let count = 0;
 *   const interval = setInterval(async () => {
 *     if (count < 5) {
 *       await next(count++); // waits until the value is handled
 *     } else {
 *       await done();
 *       clearInterval(interval);
 *     }
 *   }, 1000);
 *   return () => clearInterval(interval); // Cleanup function
 * });
 * (async () => {
 *   for await (const num of asyncGen) {
 *     console.log(num); // Logs numbers 0 to 4 at 1 second intervals
 *   }
 *   console.log("Completed");
 * })();
 * ```
 * @template T The type of values yielded by the generator
 * @template E The type of errors that can be thrown; defaults to Error
 * @param init Initialization function that sets up the generator behavior with next/done callbacks;
 *  The first parameter - `next` function - is used to yield values to consumers;
 *  It returns a Promise<boolean> indicating whether the value was successfully handled;
 *  The second parameter - `done` function - is used to signal completion or error;
 *  It returns a Promise<boolean> indicating whether the completion was successfully handled;
 *  The initialization function can optionally return a cleanup function (or a promise of one,
 *  when `init` is async) that will be called when the generator is closed or an error occurs;
 *  A synchronous throw from `init`, or a rejection of the promise it returns, is passed to
 *  `done(error)`;
 *  `init` runs lazily, on the first pull of the generator, not when it is created;
 * @param skipValues If true, only the most recent value is kept in the queue,
 * skipping intermediate values (not consumed values are considered skipped);
 * This is useful for scenarios where only the latest value matters, such as UI updates.
 * Defaults to false, meaning all values are queued and processed in order.
 * @returns AsyncGenerator that properly manages backpressure and resource cleanup
 */
export function newAsyncGenerator<T, E = Error>(
  /**
   * Initialization function that sets up the async generator behavior.
   * @param next - Function to yield values to consumers. Returns a Promise<boolean>
   *               indicating whether the value was successfully handled.
   * @param done - Function to signal completion or error. An error other than `undefined`
   *               or `null` will cause the generator to throw that error.
   * @returns Optional cleanup function (or a promise of one) that will be called when the
   *          generator terminates.
   */
  init: (
    next: (value: T) => Promise<boolean>,
    done: (err?: E) => Promise<boolean>,
    // biome-ignore lint/suspicious/noConfusingVoidType: an `async` init without a return value is Promise<void>
  ) => void | AsyncGeneratorCleanup | Promise<void | AsyncGeneratorCleanup>,

  /**
   * Skipping queue implementation that maintains only the most recent value.
   */
  skipValues = false,
): AsyncGenerator<T> {
  /**
   * Internal queue slot type that wraps values and completion signals with resolution callbacks.
   * This enables the async generator to communicate back to producers whether their values
   * were successfully processed, enabling backpressure management.
   */
  type IterationSlot =
    | { done: false; value: T } // Regular value slot
    | { done: true; error?: E }; // Completion/error slot
  type QueueSlot = IterationSlot & {
    next: QueueSlot | undefined; // Pointer to the next slot in the queue
    resolve: (handled: boolean) => void; // Callback to signal if the value was handled
  };

  let head: QueueSlot | undefined; // Head of the queue
  let tail: QueueSlot | undefined; // Tail of the queue

  /** Flag to prevent new values from being queued after generator closes */
  let closed = false;

  /** Set once a done slot is queued: later `next`/`done` calls resolve `false` at once */
  let doneQueued = false;

  /** Wake-up function to notify the generator loop of new items (or of `return()`) */
  let wakeUp: undefined | (() => void);

  /**
   * Drains the internal queue, notifying all pending producers that their values
   * were not processed. This prevents memory leaks and ensures proper backpressure
   * signaling.
   */
  const drainQueue = () => {
    for (; head; head = head.next) {
      head.resolve(false); // Notify producer that value was not handled
    }
    tail = undefined;
  };

  /**
   * Enqueues a value or completion signal with a promise that resolves when the item
   * is processed. This enables backpressure by allowing producers to know when their
   * values have been consumed.
   */
  const enqueue = (params: IterationSlot): Promise<boolean> => {
    if (closed || doneQueued) {
      // The generator is closed or will close after the queued done slot
      return Promise.resolve(false);
    }
    if (params.done) {
      doneQueued = true;
    } else if (skipValues) {
      // Drop the previous pending values; the queue holds no done slot here,
      // since values are refused once one is queued.
      drainQueue();
    }
    return new Promise<boolean>((resolve) => {
      // Add the new slot to the queue
      const slot: QueueSlot = { ...params, next: undefined, resolve };
      if (tail) {
        tail.next = slot;
      }
      tail = slot;
      if (!head) {
        head = tail;
      }
      // Notify the generator loop that a new item is available
      wakeUp?.();
    });
  };

  /**
   * Producer function to yield a value to consumers. Returns a promise that resolves
   * to true if the value was successfully processed, false if the generator is closed
   * or the value was skipped due to backpressure.
   */
  const next = (value: T): Promise<boolean> => enqueue({ done: false, value });

  /**
   * Producer function to signal completion or error. An error other than `undefined`
   * or `null` will cause the generator to throw that error to consumers.
   */
  const done = (error?: E): Promise<boolean> => enqueue({ done: true, error });

  /** Calls a cleanup that arrived after the generator finished; nobody can receive its error. */
  const runLateCleanup = (cleanup: AsyncGeneratorCleanup) => {
    Promise.resolve()
      .then(cleanup)
      .catch(() => {});
  };

  /**
   * Attaches `cause` to `error` as its `cause` when `error` is an extensible object
   * without one; otherwise `cause` is dropped, so the original error is never replaced.
   */
  const attachCause = (error: unknown, cause: unknown) => {
    if (typeof error !== "object" || error === null || !Object.isExtensible(error)) return;
    if ((error as { cause?: unknown }).cause !== undefined) return;
    try {
      Object.defineProperty(error, "cause", {
        value: cause,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    } catch {
      // A non-configurable `cause` property: keep the original error as it is
    }
  };

  async function* run(): AsyncGenerator<T> {
    // Initialize the producer by calling the init function with our control functions
    let cleanup: AsyncGeneratorCleanup | undefined;
    try {
      const result = init(next, done);
      if (typeof result === "function") {
        cleanup = result;
      } else if (result && typeof result.then === "function") {
        result.then(
          (fn) => {
            if (typeof fn !== "function") return;
            if (closed) runLateCleanup(fn);
            else cleanup = fn;
          },
          (error) => done(error as E),
        );
      }
    } catch (error) {
      done(error as E);
    }

    /** The error the generator is ending with, if any */
    let failure: { error: unknown } | undefined;
    try {
      // Main async generator loop - processes queued items and yields values
      while (!closed) {
        // Try to get the next item from the queue
        if (!head) {
          // If no items available, wait for producers to add something
          await new Promise<void>((resolve) => {
            wakeUp = resolve;
          });
          wakeUp = undefined;
          continue;
        }

        // Process the next item in the queue
        const slot = head;
        // Move head to the next item
        head = head.next;
        // If we removed the tail, clear it as well
        if (tail === slot) {
          tail = head;
        }
        try {
          // Handle completion/error signals
          if (slot.done) {
            closed = true;
            if (slot.error !== undefined && slot.error !== null) {
              throw slot.error;
            }
            break;
          }
          // Yield the value to the consumer
          yield slot.value;
        } finally {
          // Signal successful processing
          slot.resolve(true);
        }
      }
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      /**
       * Cleanup phase - ensures proper resource management and notification of any
       * remaining producers. This runs whether the generator completes normally,
       * encounters an error, or is closed early by the consumer.
       */
      closed = true;
      await finish(cleanup, failure);
    }
  }

  /**
   * Calls the cleanup, then drains the queue even if the cleanup throws. A cleanup error
   * rejects the returned promise only when the generator is not already ending with an
   * error (`failure`); otherwise it is attached to that error, which is kept.
   */
  const finish = async (
    cleanup: AsyncGeneratorCleanup | undefined,
    failure: { error: unknown } | undefined,
  ): Promise<void> => {
    try {
      await cleanup?.();
    } catch (cleanupError) {
      if (!failure) throw cleanupError;
      attachCause(failure.error, cleanupError);
    } finally {
      /**
       * Drain any remaining items in the queue and notify their producers that
       * the values were not processed. This prevents memory leaks and ensures
       * proper backpressure signaling.
       */
      drainQueue();
    }
  };

  const generator = run();
  const runReturn = generator.return.bind(generator);
  /**
   * A native async generator queues `return()` behind a pending `next()`, so an idle
   * producer would block cancellation. Close the generator and wake its loop first:
   * the pending `next()` then settles with `{ done: true }` and cleanup runs.
   */
  generator.return = (value) => {
    closed = true;
    wakeUp?.();
    return runReturn(value);
  };
  return generator;
}
