---
"@statewalker/shared-generators": patch
---

Fix `newAsyncGenerator`: skip mode keeps the last value and the error of `done(err)` (#22); a throwing or rejecting `init` reaches the consumer as `done(err)`, and an async `init` may resolve to its cleanup (#23); a throwing cleanup still drains pending producers and keeps the original error (#24). `return()` now settles a pending `next()`, and `done(null)` completes normally (#34).
