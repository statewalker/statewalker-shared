export class BaseClass {
  private _listeners: Set<() => void> = new Set();

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

  fromJSON(obj: Record<string, unknown>): this {
    const self = this as Record<string, unknown>;
    let changed = false;
    for (const key of Object.keys(obj)) {
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
