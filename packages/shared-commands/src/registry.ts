import type { CommandDeclaration } from "./types.js";

type AnyDeclaration = CommandDeclaration<unknown, unknown>;

/**
 * Read-only command declaration registry. Implementations: mutable
 * (via `CommandsRegistry.create`), composed union (`compose`),
 * predicate-filtered (`filter`), and key-prefixed (`namespace`).
 */
export interface CommandsRegistry {
  list(): readonly AnyDeclaration[];
  get(key: string): AnyDeclaration | undefined;
  onUpdate(fn: () => void): () => void;
}

/**
 * Mutable registry. Adds chainable, variadic `.set` / `.remove`.
 */
export interface MutableCommandsRegistry extends CommandsRegistry {
  set(...decls: AnyDeclaration[]): this;
  remove(...keys: string[]): this;
}

class MutableRegistry implements MutableCommandsRegistry {
  private readonly _map = new Map<string, AnyDeclaration>();
  private readonly _subs = new Set<() => void>();

  constructor(decls: AnyDeclaration[]) {
    for (const d of decls) {
      const existing = this._map.get(d.key);
      if (existing && existing !== d) {
        throw new RangeError(
          `CommandsRegistry: duplicate key "${d.key}" with different declaration in seed`,
        );
      }
      this._map.set(d.key, d);
    }
  }

  list(): readonly AnyDeclaration[] {
    return [...this._map.values()];
  }

  get(key: string): AnyDeclaration | undefined {
    return this._map.get(key);
  }

  onUpdate(fn: () => void): () => void {
    this._subs.add(fn);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this._subs.delete(fn);
    };
  }

  set(...decls: AnyDeclaration[]): this {
    for (const d of decls) {
      const existing = this._map.get(d.key);
      if (existing && existing !== d) {
        throw new RangeError(
          `CommandsRegistry: key "${d.key}" already registered with a different declaration`,
        );
      }
    }
    let changed = false;
    for (const d of decls) {
      if (!this._map.has(d.key)) {
        this._map.set(d.key, d);
        changed = true;
      }
    }
    if (changed) this._notify();
    return this;
  }

  remove(...keys: string[]): this {
    let changed = false;
    for (const k of keys) {
      if (this._map.delete(k)) changed = true;
    }
    if (changed) this._notify();
    return this;
  }

  private _notify(): void {
    for (const fn of [...this._subs]) {
      fn();
    }
  }
}

function composeView(sources: CommandsRegistry[]): CommandsRegistry {
  return {
    list(): readonly AnyDeclaration[] {
      const out: AnyDeclaration[] = [];
      for (const s of sources) {
        for (const d of s.list()) out.push(d);
      }
      return out;
    },
    get(key: string): AnyDeclaration | undefined {
      for (const s of sources) {
        const hit = s.get(key);
        if (hit) return hit;
      }
      return undefined;
    },
    onUpdate(fn: () => void): () => void {
      const disposers = sources.map((s) => s.onUpdate(fn));
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        for (const d of disposers) d();
      };
    },
  };
}

function filterView(
  source: CommandsRegistry,
  predicate: (decl: AnyDeclaration) => boolean,
): CommandsRegistry {
  return {
    list(): readonly AnyDeclaration[] {
      return source.list().filter(predicate);
    },
    get(key: string): AnyDeclaration | undefined {
      const hit = source.get(key);
      return hit && predicate(hit) ? hit : undefined;
    },
    onUpdate(fn: () => void): () => void {
      return source.onUpdate(fn);
    },
  };
}

function namespaceView(source: CommandsRegistry, prefix: string): CommandsRegistry {
  const wrap = (d: AnyDeclaration): AnyDeclaration => Object.freeze({ ...d, key: prefix + d.key });
  return {
    list(): readonly AnyDeclaration[] {
      return source.list().map(wrap);
    },
    get(externalKey: string): AnyDeclaration | undefined {
      if (!externalKey.startsWith(prefix)) return undefined;
      const inner = externalKey.slice(prefix.length);
      const hit = source.get(inner);
      return hit ? wrap(hit) : undefined;
    },
    onUpdate(fn: () => void): () => void {
      return source.onUpdate(fn);
    },
  };
}

/**
 * `CommandsRegistry` namespace value. Factories for creating mutable
 * registries and composing / filtering / namespacing them into
 * read-only views.
 *
 * The namespace value coexists with the `CommandsRegistry` interface
 * type — TypeScript distinguishes by position.
 */
export const CommandsRegistry = {
  /** Fresh mutable registry, optionally seeded with the variadic declarations. */
  create(...decls: AnyDeclaration[]): MutableCommandsRegistry {
    return new MutableRegistry(decls);
  },
  /** Read-only union view; `get` is first-match-wins. */
  compose(...sources: CommandsRegistry[]): CommandsRegistry {
    return composeView(sources);
  },
  /** Predicate-filtered read-only view. */
  filter(source: CommandsRegistry, predicate: (decl: AnyDeclaration) => boolean): CommandsRegistry {
    return filterView(source, predicate);
  },
  /** Read-only view that wraps each declaration's `key` with `prefix`. */
  namespace(source: CommandsRegistry, prefix: string): CommandsRegistry {
    return namespaceView(source, prefix);
  },
} as const;
