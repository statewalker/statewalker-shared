---
"@statewalker/shared-baseclass": patch
---

`fromJSON` now ignores `__proto__`, `constructor`, `prototype`, `_`-prefixed keys and keys holding functions, mirroring `toJSON` (#27). `waitFor`/`waitForValue` handle sources that emit on subscribe and reject (and unsubscribe) when the check throws (#35); `readValues` ends and unsubscribes on `return()`/`throw()` even while waiting for a value (#34).
