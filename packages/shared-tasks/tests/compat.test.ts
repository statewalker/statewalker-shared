// A store created by @statewalker/ai-tasks 0.1.0 opens as is: shared-tasks keeps its table layout,
// so hosts that switch packages (statewalker/statewalker-root#406) need no migration.
import { DatabaseSync } from "node:sqlite";
import { TaskQueue as AiTaskQueue } from "@statewalker/ai-tasks";
import { describe, expect, it } from "vitest";
import { type QueueReader, type SqlLike, TaskQueue } from "../src/index.js";

const ann: QueueReader = { id: "user:ann", destinations: ["user:ann"] };
const P = "alpha";

describe("stores created by ai-tasks 0.1.0", () => {
  it("open in shared-tasks with their tasks, subscriptions, leases and job logs", () => {
    const db = new DatabaseSync(":memory:");
    const sql: SqlLike = {
      exec: (query, ...bindings) => {
        const rows = db.prepare(query).all(...(bindings as never[]));
        return { toArray: () => rows as Record<string, unknown>[] };
      },
    };
    let now = 1_000_000;
    const clock = { now: () => now };

    const before = new AiTaskQueue(sql, clock);
    before.subscribe(P, { name: "work", filter: { subject: "jobs.*" } }, "user:ann");
    const waiting = before.publish(P, { subject: "jobs.a", payload: { n: 1 } }, "user:ann");
    const leased = before.publish(P, { subject: "jobs.b", payload: { n: 2 } }, "user:ann");
    const [oldLease] = before.claim(P, "work", ann, { limit: 1 });
    expect(oldLease?.task.id).toBe(waiting.id);
    before.renew(String(oldLease?.id), "user:ann", { progress: { step: 1 } });

    now += 1_000;
    const after = new TaskQueue(sql, clock);
    expect(after.listSubscriptions(P).map((s) => s.name)).toEqual(["work"]);
    expect(after.listTasks(P).map((t) => t.id)).toEqual([waiting.id, leased.id]);
    expect(after.job(P, String(oldLease?.id), "user:ann").entries).toEqual([
      { at: expect.any(Number), progress: { step: 1 } },
    ]);
    after.ack(String(oldLease?.id), "user:ann");
    const [next] = after.claim(P, "work", ann);
    expect(next?.task).toMatchObject({ id: leased.id, payload: { n: 2 } });
    after.ack(String(next?.id), "user:ann");
    expect(after.listTasks(P)).toEqual([]);
  });
});
