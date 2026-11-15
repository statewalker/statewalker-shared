---
"@statewalker/shared-commands": patch
---

One command lifecycle for the `Commands` bus (pending, claimed, validating, settled) that every settlement route goes through. The dispatched `Command` no longer carries internal flags (`claimed`, `observerRan`, `resolveFrom`), and `settled` is read-only: assigning it throws instead of reopening a settled command.
