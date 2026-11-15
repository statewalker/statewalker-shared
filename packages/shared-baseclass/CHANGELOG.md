# @statewalker/shared-baseclass

## 0.1.5

### Patch Changes

- c766790: `fromJSON` now ignores `__proto__`, `constructor`, `prototype`, `_`-prefixed keys and keys holding functions, mirroring `toJSON` (#27). `waitFor`/`waitForValue` handle sources that emit on subscribe and reject (and unsubscribe) when the check throws (#35); `readValues` ends and unsubscribes on `return()`/`throw()` even while waiting for a value (#34).

## 0.1.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: dist/wait.d.ts, dist/wait.d.ts.map, dist/wait.js, dist/wait.js.map, src/index.ts, 1 more

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
