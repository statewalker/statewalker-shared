# @statewalker/shared-baseclass

## 0.1.6

### Patch Changes

- 0df6e86: One notifier for listener sets (#41). `@statewalker/shared-baseclass` exports `Notifier`, and `BaseClass`, the commands registry and `Slots` now build on it. They share one set of rules:
  
  - Notification passes iterate over a copy of the listener set.
  - A throwing listener no longer stops the others. `BaseClass.notify()` and the registry's `set` / `remove` rethrow the error after every listener has run (an `AggregateError` when several listeners threw). `Slots` keeps logging these errors.
  - Disposers are idempotent and never remove a later registration.
  - Every listener in one pass receives the same value.
  
  `BaseClass`'s public API is unchanged. Behaviour changes: a listener added during `notify()` is first called by the next pass, and a stale `onUpdate` disposer no longer removes a later registration. `readValues` is now built on `newAsyncGenerator`, so `@statewalker/shared-baseclass` depends on `@statewalker/shared-generators`, and `@statewalker/shared-commands` and `@statewalker/shared-slots` depend on `@statewalker/shared-baseclass`.

## 0.1.5

### Patch Changes

- c766790: `fromJSON` now ignores `__proto__`, `constructor`, `prototype`, `_`-prefixed keys and keys holding functions, mirroring `toJSON` (#27). `waitFor`/`waitForValue` handle sources that emit on subscribe and reject (and unsubscribe) when the check throws (#35); `readValues` ends and unsubscribes on `return()`/`throw()` even while waiting for a value (#34).

## 0.1.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: dist/wait.d.ts, dist/wait.d.ts.map, dist/wait.js, dist/wait.js.map, src/index.ts, 1 more

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
