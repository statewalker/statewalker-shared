---
"@statewalker/shared-logger": patch
"@statewalker/shared-logger-pino": patch
---

shared-logger-pino keeps message and stack of Errors passed after a message (`log.error("msg", err)` now logs `err`) and inside `args` (#29). Both packages read `LOG_LEVEL` case-insensitively, treat an empty value as unset and fall back to `info` with a warning on unknown names; shared-logger also rejects inherited property names as levels, makes process IDs 8 hex characters and drops the `@types/node` reference from its source (#38).
