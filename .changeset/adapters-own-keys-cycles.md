---
"@statewalker/shared-adapters": patch
---

Adapter lookup now reads only own properties (`Object.hasOwn`), so keys like `constructor` no longer return `Object.prototype` members, and a cyclic parent chain stops instead of looping forever; the different parent-walk defaults of `getAdapter` and `newAdapter` are documented (#39).
