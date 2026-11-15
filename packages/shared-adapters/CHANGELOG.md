# @statewalker/shared-adapters

## 0.1.4

### Patch Changes

- 744a6dc: Adapter lookup now reads only own properties (`Object.hasOwn`), so keys like `constructor` no longer return `Object.prototype` members, and a cyclic parent chain stops instead of looping forever; the different parent-walk defaults of `getAdapter` and `newAdapter` are documented (#39).

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md

## 0.1.1

### Patch Changes

- Initial public release from the statewalker multi-repo ecosystem.
