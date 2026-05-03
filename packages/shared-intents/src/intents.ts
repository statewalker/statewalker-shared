import { Intents } from "./types.js";

/**
 * Backwards-compatible factory. Prefer `new Intents()` directly, or — in
 * workspace-aware code — `workspace.requireAdapter(Intents)`. Kept for one
 * release to avoid churning legacy call sites.
 */
export function createIntents(): Intents {
  return new Intents();
}
