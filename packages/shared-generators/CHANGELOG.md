# @statewalker/shared-generators

## 0.1.4

### Patch Changes

- 8a6b7e4: Fix `newAsyncGenerator`: skip mode keeps the last value and the error of `done(err)` (#22); a throwing or rejecting `init` reaches the consumer as `done(err)`, and an async `init` may resolve to its cleanup (#23); a throwing cleanup still drains pending producers and keeps the original error (#24). `return()` now settles a pending `next()`, and `done(null)` completes normally (#34).

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
