# @statewalker/shared-logger-pino

## 0.1.6

### Patch Changes

- 2312df2: shared-logger-pino keeps message and stack of Errors passed after a message (`log.error("msg", err)` now logs `err`) and inside `args` (#29). Both packages read `LOG_LEVEL` case-insensitively, treat an empty value as unset and fall back to `info` with a warning on unknown names; shared-logger also rejects inherited property names as levels, makes process IDs 8 hex characters and drops the `@types/node` reference from its source (#38).
- Updated dependencies [2312df2]
  - @statewalker/shared-logger@0.1.6

## 0.1.5

### Patch Changes

- Release of the changes since the last published version:
  
  - @statewalker/shared-logger ^0.1.4 -> ^0.1.5

## 0.1.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md
- Updated dependencies
  - @statewalker/shared-logger@0.1.4

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
- Updated dependencies
  - @statewalker/shared-logger@0.1.1
