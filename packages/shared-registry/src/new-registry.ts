// See https://dots.statewalker.com/registry/index.html

/**
 * Creates a disposer registry.
 *
 * @param onError receives whatever a listener threw or rejected with. The type `E` is not
 *   checked at runtime: a listener can throw any value, so `E` is an unchecked assertion by the
 *   caller (keep the default `unknown` unless every listener is known to throw `E`). If `onError`
 *   itself throws, the failure is reported with `console.error` and cleanup continues.
 * @returns `[register, cleanup]`:
 *   - `register(callback?)` adds a callback and returns its disposer. The disposer runs the
 *     callback at most once; every call returns the same promise, which settles when the
 *     callback has finished.
 *   - `cleanup()` runs the remaining callbacks newest first, one after another, including
 *     callbacks registered while it runs. Calls made while a cleanup is in flight return the
 *     same promise.
 */
export function newRegistry<E = unknown>(
  onError: (error: E) => void = console.error,
): [
  register: (callback?: () => void | Promise<void>) => () => Promise<void>,
  cleanup: () => Promise<void>,
] {
  // Insertion-ordered: the last entry is the most recently registered one. An entry stays here
  // until its listener has finished, so `cleanup()` waits for disposers already in flight.
  const registrations = new Map<number, () => Promise<void>>();
  let registrationId = 0;
  let cleanupInFlight: Promise<void> | undefined;

  function reportError(error: unknown): void {
    try {
      const result: unknown = onError(error as E);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        Promise.resolve(result).catch((handlerError) => {
          console.error(handlerError, error);
        });
      }
    } catch (handlerError) {
      console.error(handlerError, error);
    }
  }

  function newest(): (() => Promise<void>) | undefined {
    let result: (() => Promise<void>) | undefined;
    for (const registration of registrations.values()) result = registration;
    return result;
  }

  return [
    function register(listener?: () => void | Promise<void>): () => Promise<void> {
      const id = registrationId++;
      let promise: Promise<void> | undefined;
      const dispose = (): Promise<void> => {
        if (!promise) {
          promise = (async () => {
            try {
              await listener?.();
            } catch (e) {
              reportError(e);
            } finally {
              registrations.delete(id);
            }
          })();
        }
        return promise;
      };
      registrations.set(id, dispose);
      return dispose;
    },
    function cleanup(): Promise<void> {
      if (!cleanupInFlight) {
        cleanupInFlight = (async () => {
          try {
            for (let registration = newest(); registration; registration = newest()) {
              await registration();
            }
          } finally {
            cleanupInFlight = undefined;
          }
        })();
      }
      return cleanupInFlight;
    },
  ];
}
