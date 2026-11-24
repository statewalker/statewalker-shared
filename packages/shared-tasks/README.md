# @statewalker/shared-tasks

## What it is

A durable task queue and its contract:

- **Tasks** are JSON messages published under a subject (`orders.created`), optionally for one
  destination, optionally asking for a reply through an inbox (`reply_to`, `correlation_id`).
- **Subscriptions** receive every task whose subject matches their filter (NATS-style `*` and
  `>` tokens, plus optional destination and sender filters). Each matching task is delivered to
  each subscription at least once.
- **Leases** hold one task for one processor for a limited time. A lease can be renewed (with a
  progress entry), acked, or released. After `max_attempts` failed leases the task goes to the
  subscription's dead letters.
- **Job logs** record a lease's progress entries, and a reply refers to its job log. Entries are
  stamped strictly increasing, so a reader resumes after the last stamp it saw
  (`job(project, id, { after, wait_ms })` long-polls for the next one). The last entry of an
  ended job records its `outcome`: `done` (acked), `error` (released, or the lease ran out) or
  `cancelled`.
- **Cancelling** (`cancel`, by the task's sender or an admin) removes a waiting task. A leased
  task ends at its holder's next `renew`, which fails with `ECANCELED`; there is no retry and no
  dead letter.
- **`Processor`** (`run(lease, { signal, progress })`) is the work done for a subscription's
  tasks, and **`serveSubscription`** runs one: it claims tasks, keeps their leases renewed, writes
  progress to the job log, replies and acks.
- **`TaskQueue`** implements the queue over SQLite: anything with the `exec` shape of a Durable
  Object's `SqlStorage` (`SqlLike`), including `node:sqlite` in tests. `queueApi` wraps it as a
  same-process `TasksApi` without rights checks.

The contract names no host. A sender, owner or holder is an opaque principal string the host
stamps (`user:<name>`, `session:<id>`), and rights, limits and transport are the host's.

**Storage.** The layout is versioned (`SCHEMA_VERSION`, recorded in `task_schema`). Opening a
store upgrades it in place: missing columns are added with defaults, and no data is dropped. Stores
created by `@statewalker/ai-tasks` 0.1.0 are version 1. A store upgraded by a version cannot be
opened by an older one, which refuses a newer schema; that is the rollback limit.

## Why it exists

Two hosts need the same queue: the AI harness (statewalker-ai), whose projects receive tasks from
people, agents, webhooks and schedules, and the fragment platform's `system.tasks`, which serves
commands exposed as `task`. The contract moved here, to the lowest layer, so both can depend on
it (statewalker/statewalker-root#204, ADR `2026-11-23-commands-tasks-and-jobs` in
statewalker-root). It replaces `@statewalker/ai-tasks`, where it was first built: the table layout
is unchanged, so stores created by ai-tasks 0.1.0 open as they are. The one rename is `Executor`,
now `Processor`.

## How to use

```sh
pnpm add @statewalker/shared-tasks
```

```ts
import { queueApi, serveSubscription, TaskQueue, type Processor } from "@statewalker/shared-tasks";

const queue = new TaskQueue(ctx.storage.sql); // a Durable Object's SqlStorage, or any SqlLike
queue.subscribe("p1", { name: "thumbnails", filter: { subject: "images.uploaded" } }, "user:ann");

const processor: Processor = {
  async run(lease, { signal, progress }) {
    await progress({ step: "resizing" });
    return makeThumbnail(lease.task.payload, { signal });
  },
};

const stop = new AbortController();
serveSubscription(queueApi(queue, { id: "user:ann", destinations: ["user:ann"] }), {
  project: "p1",
  subscription: "thumbnails",
  processor,
  signal: stop.signal,
});

queue.publish("p1", { subject: "images.uploaded", payload: { key: "a.png" } }, "user:bob");
```

## API

- `TaskQueue`: the queue over `SqlLike`, with `publish`, `listTasks`, `subscribe`,
  `listSubscriptions`, `unsubscribe`, `peek`, `take`, `claim`, `ack`, `release`, `renew`,
  `reply`, `createInbox`, `deadLetters`, `job`, `cancel`, `changeSeq`, `sweep` and
  `dropProject`; every call is synchronous. `waitChange` and `waitJob` wait for a change or a
  job-log entry.
- `TaskQueueOptions`, `DEFAULTS`: clock, id generator and limits (64 KB payloads, 7-day expiry,
  5-minute leases, 3 attempts, dead letters kept 14 days).
- `queueApi(queue, reader)`: a `TasksApi` over one queue for one reader, in the same process.
- `serveSubscription(api, options)`: serves one subscription with a `Processor`. It ends each
  lease before replying, so the job log is complete when the reply arrives. Replies carry a
  `RunnerReply` (`{ job, result?, error?, cancelled? }`). A cancelled task aborts the
  processor's `signal` at the next renew, and its reply has `cancelled: true`.
- `subjectMatches`, `isSubject`, `isPattern`, `isInbox`, `INBOX_PREFIX`: subjects and filters.
- Types: `Task`, `TaskInput`, `Subscription`, `SubscriptionFilter`, `Lease`, `DeadLetter`,
  `JobEntry`, `JobOutcome`, `JobLog`, `TasksApi`, `Processor`, `ProcessorContext`, `SqlLike`,
  `QueueReader` (with `admin` for cancelling any task).

## Related

- `@statewalker/shared-commands`: the in-process command bus. A command is a call its caller waits
  for, and a task is a durable message: the platform joins them through the `task` exposure.
