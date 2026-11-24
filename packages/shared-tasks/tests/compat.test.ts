// A store created by @statewalker/ai-tasks 0.1.0 opens as is: shared-tasks keeps its table layout,
// so hosts that switch packages (statewalker/statewalker-root#406) need no migration.
//
// The fixture is an SQL dump of a store that the published ai-tasks 0.1.0 created once (schema and
// rows): subscription `work` on `jobs.*`, task id1 leased as id3 with one progress entry, and task
// id2 waiting. A dump rather than a dependency: statewalker-shared (L0) must not depend on
// statewalker-ai (L3), even for tests.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { type QueueReader, type SqlLike, TaskQueue } from "../src/index.js";

const ann: QueueReader = { id: "user:ann", destinations: ["user:ann"] };
const P = "alpha";

function aiTasksStore(): SqlLike {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./fixtures/ai-tasks-0.1.0.sql", import.meta.url), "utf8"));
  return {
    exec: (query, ...bindings) => {
      const rows = db.prepare(query).all(...(bindings as never[]));
      return { toArray: () => rows as Record<string, unknown>[] };
    },
  };
}

describe("stores created by ai-tasks 0.1.0", () => {
  it("open in shared-tasks with their tasks, subscriptions, leases and job logs", () => {
    let n = 100;
    const queue = new TaskQueue(aiTasksStore(), { now: () => 1_001_000, newId: () => `x${++n}` });
    expect(queue.listSubscriptions(P).map((s) => s.name)).toEqual(["work"]);
    expect(queue.listTasks(P).map((t) => t.id)).toEqual(["id1", "id2"]);
    expect(queue.job(P, "id3", "user:ann").entries).toEqual([
      { at: 1_000_000, progress: { step: 1 } },
    ]);
    queue.renew("id3", "user:ann", { progress: { step: 2 } });
    queue.ack("id3", "user:ann");
    const [next] = queue.claim(P, "work", ann);
    expect(next?.task).toMatchObject({ id: "id2", payload: { n: 2 } });
    queue.ack(String(next?.id), "user:ann");
    expect(queue.listTasks(P)).toEqual([]);
  });

  it("are not changed by opening them", () => {
    const store = aiTasksStore();
    const schema = () =>
      store
        .exec("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
        .toArray();
    const before = schema();
    new TaskQueue(store);
    expect(schema()).toEqual(before);
  });
});
