# @statewalker/shared-logger

## 0.1.6

### Patch Changes

- 2312df2: shared-logger-pino keeps message and stack of Errors passed after a message (`log.error("msg", err)` now logs `err`) and inside `args` (#29). Both packages read `LOG_LEVEL` case-insensitively, treat an empty value as unset and fall back to `info` with a warning on unknown names; shared-logger also rejects inherited property names as levels, makes process IDs 8 hex characters and drops the `@types/node` reference from its source (#38).
- Updated dependencies [744a6dc]
  - @statewalker/shared-adapters@0.1.4

## 0.1.5

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: dist/logger.adapter.js.map, dist/new-state-tracer.d.ts.map, dist/new-state-tracer.js.map, src/logger.adapter.ts, src/new-state-tracer.ts

## 0.1.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md
- Updated dependencies
  - @statewalker/shared-adapters@0.1.3

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
- Updated dependencies
  - @statewalker/shared-adapters@0.1.1
