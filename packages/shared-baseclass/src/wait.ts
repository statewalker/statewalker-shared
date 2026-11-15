/**
 * Subscribes `listener` and runs it once more if needed, tolerating sources that call the
 * listener synchronously during `onUpdate` (before the disposer is returned). `listener` returns
 * true once it has settled; the subscription is then removed (right away, or as soon as the
 * disposer is available).
 */
function subscribeUntil(
  onUpdate: (callback: () => void) => () => void,
  listener: () => boolean,
): void {
  let settled = false;
  let unsub: (() => void) | undefined;
  unsub = onUpdate(() => {
    if (settled) return;
    if (listener()) {
      settled = true;
      unsub?.();
    }
  });
  if (settled) unsub();
}

/**
 * Utility function transforming a sync callback notification to promise of a value returned by the given get method.
 *
 * The source may call the listener synchronously on subscribe. If `get` throws (initially or in a
 * later notification), the promise rejects with that error and the listener is removed; the error
 * does not propagate into the `notify()` caller.
 *
 * @param onUpdate A function that registers a callback to be called whenever the object updates. It returns a cleanup function to unregister the callback.
 * @param get A function that returns a value or undefined.
 * @returns The value returned by the get method
 */
export function waitForValue<T>(
  onUpdate: (callback: () => void) => () => void,
  get: () => undefined | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const value = get();
    if (value !== undefined) return resolve(value);
    subscribeUntil(onUpdate, () => {
      try {
        const value = get();
        if (value === undefined) return false;
        resolve(value);
      } catch (error) {
        reject(error);
      }
      return true;
    });
  });
}

/**
 * Utility function transforming a sync callback notification to a promise that resolves once the given check passes.
 *
 * The source may call the listener synchronously on subscribe. If `check` throws (initially or in
 * a later notification), the promise rejects with that error and the listener is removed; the
 * error does not propagate into the `notify()` caller.
 *
 * @param onUpdate A function that registers a callback to be called whenever the object updates. It returns a cleanup function to unregister the callback.
 * @param check A function that returns true once the awaited condition holds.
 * @returns A promise resolved (with no value) when `check` returns true
 */
export function waitFor(
  onUpdate: (callback: () => void) => () => void,
  check: () => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (check()) return resolve();
    subscribeUntil(onUpdate, () => {
      try {
        if (!check()) return false;
        resolve();
      } catch (error) {
        reject(error);
      }
      return true;
    });
  });
}
