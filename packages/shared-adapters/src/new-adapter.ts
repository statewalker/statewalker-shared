/**
 * Creates a type-safe adapter utility for accessing and managing context-specific data.
 * This utility follows the Adapter pattern and provides methods to get, set, and remove
 * adapter instances from objects. It supports hierarchical context traversal to locate
 * the adapter instance and optionally allows creating a new instance if not found.
 *
 * @template T - The type of the adapter instance.
 * @template P - The type of the context object. Defaults to `Record<string, unknown>`.
 *
 * @param key - The unique key used to identify the adapter instance in the context object.
 * @param create - An optional factory function to create the adapter instance if it is not found.
 * @param getParent - A function to retrieve the parent context of a given context object.
 *                    Defaults to accessing the `parent` property of the object.
 *
 * @returns A tuple containing:
 * - `get`: A function to retrieve the adapter instance from a context object. If the instance
 *          is not found and `create` is provided, it will create the instance. Throws an error
 *          if the instance is not found and `optional` is not defined or false.
 * - `set`: A function to set the adapter instance on a context object.
 * - `remove`: A function to remove the adapter instance from a context object.
 *
 * @throws {Error} If the adapter instance is not found and `optional` is false or not provided.
 *
 * @example
 * ```typescript
 * const [getLogger, setLogger, removeLogger] = newAdapter<Logger>('loggerKey', () => new Logger());
 *
 * const context = {};
 * setLogger(context, new DefaultLogger());
 * const logger = getLogger(context); // Retrieves the logger instance
 * removeLogger(context); // Removes the logger instance
 * ```
 *
 * @example
 * ```typescript
 * // Example illustrating the use of the `getParent` method
 * const [getLogger, setLogger] = newAdapter<Logger>(
 *   'loggerKey',
 *   () => new DefaultLogger(),
 *   (context) => context.parent // Custom getParent function
 * );
 *
 * const rootContext = { parent: null };
 * const childContext = { parent: rootContext };
 * const grandChildContext = { parent: childContext };
 *
 * setLogger(rootContext, new DefaultLogger());
 *
 * // Retrieves the logger instance from the root context by traversing up the hierarchy
 * const logger = getLogger(grandChildContext);
 * console.log(logger); // Logs the logger instance from rootContext
 * ```
 */
export function newAdapter<T, P = Record<string, unknown>>(
  key: string,
  create?: (context: P) => T,
  getParent: (context: P) => P | undefined = (context: P) =>
    (context as unknown as { parent?: P })?.parent,
): [
  get: (context: P, optional?: boolean) => T,
  set: (context: P, value: T) => void,
  remove: (context: P) => void,
] {
  const get = (context: P, optional = false): T => {
    let result: T | undefined;
    for (
      let current: P | undefined = context;
      result === undefined && current;
      current = getParent(current)
    ) {
      if (current && typeof current === "object" && key in current) {
        result = (current as Record<string, T>)[key];
      }
    }
    if (result === undefined && create) {
      result = create(context);
      if (context && typeof context === "object") {
        (context as Record<string, T>)[key] = result;
      }
    }
    if (!optional && result === undefined) {
      throw new Error(`Adapter not found: ${key}`);
    }
    return result as T;
  };

  const set = (context: P, value: T): void => {
    if (context && typeof context === "object") {
      (context as Record<string, T>)[key] = value;
    }
  };

  const remove = (context: P): void => {
    if (context && typeof context === "object" && key in context) {
      delete (context as Record<string, unknown>)[key];
    }
  };

  return [get, set, remove];
}
