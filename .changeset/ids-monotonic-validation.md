---
"@statewalker/shared-ids": patch
---

`SnowflakeId` stays strictly increasing when the clock steps back and no longer spins on sequence overflow (#28). Validate `workerId`, `epoch` and the clock; `crockfordEncode` / `crockfordDecode` / `parseSnowflakeBase32` reject out-of-range input; `sha1Bytes` accepts any `Uint8Array` (#37).
