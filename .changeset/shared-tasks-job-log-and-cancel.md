---
"@statewalker/shared-tasks": minor
---

Resumable job logs and cancellation (statewalker/statewalker-root#404).
- Job-log entries are stamped strictly increasing, and `job(project, id, { after, wait_ms })` returns the entries after a stamp, long-polling for the next one. The last entry of an ended job records its `outcome`: `done`, `error` or `cancelled`. `serveSubscription` ends the lease before it replies.
- `cancel(project, task)`, for the sender or an admin, removes a waiting task. A leased one ends at its holder's next `renew` (`ECANCELED`), with no retry and no dead letter, and the runner aborts the processor and replies `cancelled: true`.
- **Migration:** opening a store upgrades it in place to schema version 2. Columns are added with defaults, the version is recorded in `task_schema`, and no data is dropped; stores created by ai-tasks 0.1.0 or shared-tasks 0.1.0 are version 1. **Rollback:** a store upgraded to version 2 is not supported by older versions; this version refuses a schema newer than version 2.
