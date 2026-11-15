import { Notifier } from "./notifier.js";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class BaseClass {
  // A TypeScript-private field rather than `#notifier`, so that BaseClass
  // instances keep working behind a Proxy.
  private readonly _notifier = new Notifier({ dedupe: true });

  /**
   * Registers `callback` and returns its disposer. Listeners are deduplicated by reference:
   * registering the same function twice keeps one entry, and either disposer removes it. Wrap
   * the callback (`() => cb()`) for independent subscriptions. A disposer is idempotent and never
   * removes a later registration of the same function.
   */
  onUpdate = (callback: () => void): (() => void) => this._notifier.add(callback);

  /**
   * Calls every listener registered before this call. A listener added during the pass is first
   * called by the next `notify()`; one removed during it is skipped. A throwing listener does not
   * stop the others: `notify()` rethrows once all have run (an `AggregateError` when several
   * threw).
   */
  notify(): void {
    this._notifier.notify();
  }

  toJSON(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(this)) {
      if (key.startsWith("_")) continue;
      const value = (this as Record<string, unknown>)[key];
      if (typeof value !== "function") {
        obj[key] = value;
      }
    }
    return obj;
  }

  /**
   * Assigns the keys of `obj` (usually parsed JSON) and notifies once if any value changed.
   * Mirrors `toJSON`: `__proto__`, `constructor`, `prototype`, `_`-prefixed keys and keys whose
   * current value is a function (methods, `onUpdate`) are ignored.
   */
  fromJSON(obj: Record<string, unknown>): this {
    const self = this as Record<string, unknown>;
    let changed = false;
    for (const key of Object.keys(obj)) {
      if (UNSAFE_KEYS.has(key) || key.startsWith("_")) continue;
      if (typeof self[key] === "function") continue;
      if (self[key] !== obj[key]) {
        self[key] = obj[key];
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
    return this;
  }
}
