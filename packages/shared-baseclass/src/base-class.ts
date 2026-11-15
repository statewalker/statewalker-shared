const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class BaseClass {
  private _listeners: Set<() => void> = new Set();

  /**
   * Registers `callback` and returns its disposer. Listeners are kept in a `Set`, so they are
   * deduplicated by reference: registering the same function twice keeps one entry, and either
   * disposer removes it. Wrap the callback (`() => cb()`) for independent subscriptions.
   */
  onUpdate = (callback: () => void): (() => void) => {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  };

  notify(): void {
    for (const listener of this._listeners) {
      listener();
    }
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
