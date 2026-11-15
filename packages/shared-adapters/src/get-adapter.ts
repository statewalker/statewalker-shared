import { newAdapter } from "./new-adapter.js";

/**
 * Get-or-create adapter without a setter: returns `[get, remove]` built on {@link newAdapter}.
 *
 * **Parent-walk default differs from `newAdapter`.** Here `getParent` defaults to "no parent"
 * (`() => undefined`), so `get` looks only at the context itself and, when the key is missing,
 * creates the value on that context even if `context.parent` holds one. `newAdapter` defaults to
 * walking `context.parent`. Pass `getParent` explicitly to inherit, e.g. `(ctx) => ctx.parent`.
 *
 * @param key - The property key under which the value is stored on the context.
 * @param create - Factory that creates the value when it is missing; required.
 * @param getParent - Returns the parent context to search; defaults to no parent (no inheritance).
 * @returns `[get, remove]`: `get` returns the found or newly created (and cached) value,
 *          `remove` deletes the key from the context's own properties.
 */
export function getAdapter<T, O = Record<string, unknown>>(
  key: string,
  create: (object: O) => T,
  getParent: (object: O) => O | undefined = () => undefined,
): [get: (object: O) => T, remove: (object: O) => void] {
  const [get, , remove] = newAdapter<T, O>(key, create, getParent);
  return [get, remove];
}
