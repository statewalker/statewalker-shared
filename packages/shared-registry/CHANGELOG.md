# @statewalker/shared-registry

## 0.1.4

### Patch Changes

- 754a295: Concurrent `cleanup()` calls and repeated disposer calls now share one in-flight promise, so LIFO order holds and awaiting means done (#25); a throwing `onError` no longer aborts cleanup (#26); callbacks registered during `cleanup()` now run too, and `onError`'s error type is documented as unchecked (#36).

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
