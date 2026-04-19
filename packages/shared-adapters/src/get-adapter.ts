import { newAdapter } from "./new-adapter.js";

export function getAdapter<T, O = Record<string, unknown>>(
  key: string,
  create: (object: O) => T,
  getParent: (object: O) => O | undefined = () => undefined,
): [get: (object: O) => T, remove: (object: O) => void] {
  const [get, , remove] = newAdapter<T, O>(key, create, getParent);
  return [get, remove];
}
