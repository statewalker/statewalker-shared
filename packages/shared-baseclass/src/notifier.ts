/** Options of a {@link Notifier}. */
export interface NotifierOptions {
  /**
   * Subscribe a function once: adding a function that is already subscribed
   * returns a disposer for the existing subscription, so either disposer
   * removes it (the rule of `BaseClass.onUpdate`). Default `false`: every
   * `add` is an independent subscription.
   */
  readonly dedupe?: boolean;
  /**
   * Receives each error a listener throws, and `notify` does not throw.
   * Without it, `notify` rethrows once every listener has run: the error
   * itself when one listener threw, an `AggregateError` when several did.
   */
  readonly onError?: (error: unknown) => void;
}

interface Subscription<T> {
  readonly fn: (value: T) => void;
  active: boolean;
}

/**
 * An in-process listener set with one set of rules, shared by `BaseClass`,
 * the commands registry and `Slots`:
 *
 * - **Iterating a copy.** A listener added during a pass is first called by
 *   the next pass; a listener removed during a pass is not called by it.
 * - **Error isolation.** A throwing listener never stops the others (see
 *   {@link NotifierOptions.onError} for where the errors go).
 * - **Idempotent disposal.** A disposer removes only its own subscription,
 *   once: calling it again, or after the same function was subscribed again,
 *   is a no-op.
 * - **Snapshot identity.** Every listener of a pass receives the same
 *   `value` passed to `notify`.
 */
export class Notifier<T = void> {
  readonly #subs = new Set<Subscription<T>>();
  readonly #byFn: Map<(value: T) => void, Subscription<T>> | undefined;
  readonly #onError: ((error: unknown) => void) | undefined;

  constructor(options: NotifierOptions = {}) {
    this.#byFn = options.dedupe ? new Map() : undefined;
    this.#onError = options.onError;
  }

  /** Number of live subscriptions. */
  get size(): number {
    return this.#subs.size;
  }

  /** Subscribes `fn` and returns its disposer. */
  add(fn: (value: T) => void): () => void {
    let sub = this.#byFn?.get(fn);
    if (!sub) {
      sub = { fn, active: true };
      this.#subs.add(sub);
      this.#byFn?.set(fn, sub);
    }
    const owned = sub;
    return () => {
      if (!owned.active) return;
      owned.active = false;
      this.#subs.delete(owned);
      if (this.#byFn?.get(owned.fn) === owned) this.#byFn.delete(owned.fn);
    };
  }

  /** Calls every live listener with `value`. */
  notify(value: T): void {
    if (this.#subs.size === 0) return;
    const errors: unknown[] = [];
    for (const sub of [...this.#subs]) {
      if (!sub.active) continue;
      try {
        sub.fn(value);
      } catch (error) {
        if (this.#onError) this.#onError(error);
        else errors.push(error);
      }
    }
    if (errors.length === 0) return;
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, `${errors.length} listeners threw`);
  }
}
