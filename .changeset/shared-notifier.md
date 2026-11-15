---
"@statewalker/shared-baseclass": patch
"@statewalker/shared-commands": patch
"@statewalker/shared-slots": patch
---

One notifier for listener sets (#41). `@statewalker/shared-baseclass` exports `Notifier`, and `BaseClass`, the commands registry and `Slots` now build on it. They share one set of rules:

- Notification passes iterate over a copy of the listener set.
- A throwing listener no longer stops the others. `BaseClass.notify()` and the registry's `set` / `remove` rethrow the error after every listener has run (an `AggregateError` when several listeners threw). `Slots` keeps logging these errors.
- Disposers are idempotent and never remove a later registration.
- Every listener in one pass receives the same value.

`BaseClass`'s public API is unchanged. Behaviour changes: a listener added during `notify()` is first called by the next pass, and a stale `onUpdate` disposer no longer removes a later registration. `readValues` is now built on `newAsyncGenerator`, so `@statewalker/shared-baseclass` depends on `@statewalker/shared-generators`, and `@statewalker/shared-commands` and `@statewalker/shared-slots` depend on `@statewalker/shared-baseclass`.
