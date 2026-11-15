# @statewalker/shared-commands

## 0.2.5

### Patch Changes

- 133e0e1: Fix the command bus so the first `resolve`/`reject` wins and claims even with async output schemas (#18), throwing validators reject with `input-validation`/`output-validation` instead of throwing or leaking an unhandled rejection (#19), and listeners and callers receive the schema-validated (defaulted/transformed) payload and result (#20). Namespace views no longer evaluate JSON-schema getters and return identity-stable wrappers, `passthrough()` derives a `{}` JSON schema, seed collisions use the documented message (#31), and builder stages no longer share state across branches (#32).

## 0.2.4

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.2.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
