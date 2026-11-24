---
"@statewalker/shared-tasks": minor
---

New package: the durable task queue contract and its SQLite implementation, moved from `@statewalker/ai-tasks` 0.1.0 with its table layout unchanged. The one rename: `Executor` is now `Processor` (and `ExecutorContext` is `ProcessorContext`) (statewalker/statewalker-root#403).
