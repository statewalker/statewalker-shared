# @statewalker/shared-ids

## 0.1.4

### Patch Changes

- 5e6c927: `SnowflakeId` stays strictly increasing when the clock steps back and no longer spins on sequence overflow (#28). Validate `workerId`, `epoch` and the clock; `crockfordEncode` / `crockfordDecode` / `parseSnowflakeBase32` reject out-of-range input; `sha1Bytes` accepts any `Uint8Array` (#37).

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
