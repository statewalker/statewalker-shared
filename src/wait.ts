/**
 * Utility function transforming a sync callback notification to promise of a value returned by the given get method.
 *
 * @param onUpdate A function that registers a callback to be called whenever the object updates. It returns a cleanup function to unregister the callback.
 * @param get A function that returns a value or undefined.
 * @returns An the value returned by the get method
 */

export function waitForValue<T>(
  onUpdate: (callback: () => void) => () => void,
  get: () => undefined | T,
): Promise<T> {
  const value = get();
  if (value !== undefined) return Promise.resolve(value);
  return new Promise((resolve) => {
    const unsub = onUpdate(() => {
      const value = get();
      if (value !== undefined) {
        unsub();
        resolve(value);
      }
    });
  });
}

/**
 * Utility function transforming a sync callback notification to promise of a value returned by the given get method.
 *
 * @param onUpdate A function that registers a callback to be called whenever the object updates. It returns a cleanup function to unregister the callback.
 * @param get A function that returns a value or undefined.
 * @returns An the value returned by the get method
 */

export function waitFor(
  onUpdate: (callback: () => void) => () => void,
  check: () => boolean,
): Promise<void> {
  if (check()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = onUpdate(() => {
      if (check()) {
        unsub();
        resolve();
      }
    });
  });
}
