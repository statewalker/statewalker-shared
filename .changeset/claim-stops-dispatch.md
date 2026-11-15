---
"@statewalker/shared-commands": minor
---

A claim now stops the dispatch: once a listener claims a command (returns `true` or a promise), the lower-priority listeners are not invoked. Observers (listeners returning `void`) at a higher priority than the claimer still run, and throw / reject behaviour is unchanged.

This changes what 0.2.6 did. In 0.2.6 a claim did not stop the dispatch, so lower-priority listeners kept running after a higher-priority listener had claimed the command, with no public way to see the claim (the internal flags are hidden since #40). A default handler at a low priority therefore acted on commands a host had already rerouted or replaced. Now a fallback at a negative priority fires only if no higher-priority listener claimed. Code that relied on observers running after a claimer must register those observers at a higher priority than the claimer (statewalker/statewalker-shared#60).
