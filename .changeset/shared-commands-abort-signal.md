---
"@statewalker/shared-commands": minor
---

`Commands.call(decl, payload, { signal })` takes an optional `AbortSignal`. Listeners see it as `cmd.signal`; an abort before the command settles rejects the call with `CommandError` of the new kind `"aborted"` (its `cause` is the signal's reason). Calls without a signal are unchanged (statewalker/statewalker-root#405).
