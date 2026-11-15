# @statewalker/shared-slots

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
