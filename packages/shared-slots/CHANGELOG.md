# @statewalker/shared-slots

## 0.2.6

### Patch Changes

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

- 3b116ea: Make plain and keyed slot disposers idempotent so a stale or repeated disposer never removes a later registration (#21). Return a read-only keyed snapshot view, pass observers the cached frozen snapshot, iterate a copy of observers, keep one subscription per `observe` call, and document `get` returning `null` for unknown ids (#33).

## 0.2.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: dist/index.d.ts, dist/index.js, dist/index.js.map, src/define-slot.ts, src/types.ts

## 0.2.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.2.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
