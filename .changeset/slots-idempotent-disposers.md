---
"@statewalker/shared-slots": patch
---

Make plain and keyed slot disposers idempotent so a stale or repeated disposer never removes a later registration (#21). Return a read-only keyed snapshot view, pass observers the cached frozen snapshot, iterate a copy of observers, keep one subscription per `observe` call, and document `get` returning `null` for unknown ids (#33).
