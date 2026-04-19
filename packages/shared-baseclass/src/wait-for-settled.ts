import { waitFor } from "./wait.js";

export interface Settleable {
  isSettled(): boolean;
  onUpdate: (callback: () => void) => () => void;
}

export async function waitForSettled<T extends Settleable>(model: T): Promise<T> {
  await waitFor(model.onUpdate, () => model.isSettled());
  return model;
}
