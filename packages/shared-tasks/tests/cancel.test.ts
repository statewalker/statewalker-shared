// Cancelling a task: a waiting one is removed, a leased one ends at its holder's next renew
// (statewalker/statewalker-root#404).
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  type Processor,
  type QueueReader,
  queueApi,
  type SqlLike,
  serveSubscription,
  TaskQueue,
} from "../src/index.js";

const sqlite = (): SqlLike => {
  const db = new DatabaseSync(":memory:");
  return {
    exec: (query, ...bindings) => {
      const rows = db.prepare(query).all(...(bindings as never[]));
      return { toArray: () => rows as Record<string, unknown>[] };
    },
  };
};

const ann: QueueReader = { id: "user:ann", destinations: ["user:ann"] };
const P = "alpha";

function setup() {
  let n = 0;
  const queue = new TaskQueue(sqlite(), { newId: () => `id${++n}` });
  queue.subscribe(P, { name: "work", filter: { subject: "jobs.*" } }, "user:ann");
  queue.subscribe(P, { name: "audit", filter: { subject: ">" } }, "user:ann");
  return queue;
}

describe("cancel", () => {
  it("removes a waiting task: no subscription receives it", () => {
    const queue = setup();
    const task = queue.publish(P, { subject: "jobs.x" }, "user:bob");
    queue.cancel(P, task.id, "user:bob");
    expect(queue.listTasks(P)).toEqual([]);
    expect(queue.peek(P, "work", ann)).toEqual([]);
    expect(queue.peek(P, "audit", ann)).toEqual([]);
  });

  it("removes a task no subscription matched yet", () => {
    const queue = new TaskQueue(sqlite());
    const task = queue.publish(P, { subject: "late.news.today" }, "user:bob");
    queue.cancel(P, task.id, "user:bob");
    queue.subscribe(P, { name: "late", filter: { subject: "late.>" } }, "user:ann");
    expect(queue.peek(P, "late", ann)).toEqual([]);
  });

  it("ends a leased task at its next renew, without a retry", () => {
    const queue = setup();
    const task = queue.publish(P, { subject: "jobs.x" }, "user:bob");
    const [lease] = queue.claim(P, "work", ann);
    queue.cancel(P, task.id, "user:bob");
    // Its other subscription no longer receives it.
    expect(queue.peek(P, "audit", ann)).toEqual([]);
    expect(() => queue.renew(String(lease?.id), "user:ann")).toThrow(/^ECANCELED/);
    expect(queue.job(P, String(lease?.id), "user:ann").entries.at(-1)).toMatchObject({
      outcome: "cancelled",
    });
    expect(queue.peek(P, "work", ann)).toEqual([]);
    expect(queue.deadLetters(P, "work")).toEqual([]);
    expect(queue.listTasks(P)).toEqual([]);
  });

  it("lets only the sender or an admin cancel", () => {
    const queue = setup();
    const task = queue.publish(P, { subject: "jobs.x" }, "user:bob");
    expect(() => queue.cancel(P, task.id, "user:eve")).toThrow(/^EACCES/);
    expect(queue.listTasks(P)).toHaveLength(1);
    queue.cancel(P, task.id, "user:root", { admin: true });
    expect(queue.listTasks(P)).toEqual([]);
    expect(() => queue.cancel(P, task.id, "user:bob")).toThrow(/^ENOENT/);
  });

  it("aborts the processor and replies `cancelled` through the runner", async () => {
    const queue = new TaskQueue(sqlite());
    const bob = queueApi(queue, { id: "user:bob", destinations: ["user:bob"] });
    const worker = queueApi(queue, { id: "user:worker", destinations: [] });
    await worker.subscribe(P, { name: "slow", filter: { subject: "calls.slow" } });
    const inbox = await bob.createInbox(P);
    const task = await bob.publish(P, { subject: "calls.slow", reply_to: inbox.name });
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    let aborted = false;
    const processor: Processor = {
      async run(_lease, { signal, progress }) {
        started();
        // Reports progress until the renew answers "cancelled".
        while (!signal.aborted) {
          await progress({ tick: true }).catch(() => {});
          await new Promise((r) => setTimeout(r, 5));
        }
        aborted = true;
        throw signal.reason;
      },
    };
    const stop = new AbortController();
    const served = serveSubscription(worker, {
      project: P,
      subscription: "slow",
      processor,
      signal: stop.signal,
      waitMs: 20,
    });
    await running;
    await bob.cancel(P, task.id);
    let replies: Awaited<ReturnType<typeof bob.take>>["tasks"] = [];
    for (let i = 0; i < 200 && !replies.length; i++) {
      replies = (await bob.take(P, inbox.name)).tasks;
      if (!replies.length) await new Promise((r) => setTimeout(r, 5));
    }
    stop.abort();
    await served;
    expect(aborted).toBe(true);
    expect(replies[0]?.payload).toMatchObject({ cancelled: true });
    const job = await bob.job(
      P,
      String((replies[0]?.payload as { job?: string } | undefined)?.job),
    );
    expect(job.entries.at(-1)).toMatchObject({ outcome: "cancelled" });
    expect((await worker.deadLetters(P, "slow")).dead_letters).toEqual([]);
  });
});
