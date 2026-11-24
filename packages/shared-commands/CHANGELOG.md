# @statewalker/shared-commands

## 0.4.0

### Minor Changes

- 887490b: `Commands.call(decl, payload, { signal })` takes an optional `AbortSignal`. Listeners see it as `cmd.signal`; an abort before the command settles rejects the call with `CommandError` of the new kind `"aborted"` (its `cause` is the signal's reason). Calls without a signal are unchanged (statewalker/statewalker-root#405).

## 0.3.0

### Minor Changes

- 9c6c470: A claim now stops the dispatch: once a listener claims a command (returns `true` or a promise), the lower-priority listeners are not invoked. Observers (listeners returning `void`) at a higher priority than the claimer still run, and throw / reject behaviour is unchanged.
  
  This changes what 0.2.6 did. In 0.2.6 a claim did not stop the dispatch, so lower-priority listeners kept running after a higher-priority listener had claimed the command, with no public way to see the claim (the internal flags are hidden since #40). A default handler at a low priority therefore acted on commands a host had already rerouted or replaced. Now a fallback at a negative priority fires only if no higher-priority listener claimed. Code that relied on observers running after a claimer must register those observers at a higher priority than the claimer (statewalker/statewalker-shared#60).

## 0.2.6

### Patch Changes

- cd30f15: One command lifecycle for the `Commands` bus (pending, claimed, validating, settled) that every settlement route goes through. The dispatched `Command` no longer carries internal flags (`claimed`, `observerRan`, `resolveFrom`), and `settled` is read-only: assigning it throws instead of reopening a settled command.
- 0df6e86: One notifier for listener sets (#41). `@statewalker/shared-baseclass` exports `Notifier`, and `BaseClass`, the commands registry and `Slots` now build on it. They share one set of rules:
  
  - Notification passes iterate over a copy of the listener set.
  - A throwing listener no longer stops the others. `BaseClass.notify()` and the registry's `set` / `remove` rethrow the error after every listener has run (an `AggregateError` when several listeners threw). `Slots` keeps logging these errors.
  - Disposers are idempotent and never remove a later registration.
  - Every listener in one pass receives the same value.
  
  `BaseClass`'s public API is unchanged. Behaviour changes: a listener added during `notify()` is first called by the next pass, and a stale `onUpdate` disposer no longer removes a later registration. `readValues` is now built on `newAsyncGenerator`, so `@statewalker/shared-baseclass` depends on `@statewalker/shared-generators`, and `@statewalker/shared-commands` and `@statewalker/shared-slots` depend on `@statewalker/shared-baseclass`.
- Updated dependencies [0df6e86]
  - @statewalker/shared-baseclass@0.1.6

## 0.2.5

### Patch Changes

- 133e0e1: Fix the command bus so the first `resolve`/`reject` wins and claims even with async output schemas (#18), throwing validators reject with `input-validation`/`output-validation` instead of throwing or leaking an unhandled rejection (#19), and listeners and callers receive the schema-validated (defaulted/transformed) payload and result (#20). Namespace views no longer evaluate JSON-schema getters and return identity-stable wrappers, `passthrough()` derives a `{}` JSON schema, seed collisions use the documented message (#31), and builder stages no longer share state across branches (#32).

## 0.2.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.2.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
