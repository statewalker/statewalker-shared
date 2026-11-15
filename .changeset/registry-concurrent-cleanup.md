---
"@statewalker/shared-registry": patch
---

Concurrent `cleanup()` calls and repeated disposer calls now share one in-flight promise, so LIFO order holds and awaiting means done (#25); a throwing `onError` no longer aborts cleanup (#26); callbacks registered during `cleanup()` now run too, and `onError`'s error type is documented as unchecked (#36).
