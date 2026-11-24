// The job log: stamps that strictly increase, reading after a stamp (with a wait), and the final
// entry that records how the job ended (statewalker/statewalker-root#404).
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { type QueueReader, type SqlLike, TaskQueue } from "../src/index.js";

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
  let now = 1_000_000;
  let n = 0;
  const queue = new TaskQueue(sqlite(), { now: () => now, newId: () => `id${++n}` });
  queue.subscribe(P, { name: "work", filter: { subject: "jobs.*" } }, "user:ann");
  return {
    queue,
    advance: (ms: number) => {
      now += ms;
    },
    lease: () => {
      queue.publish(P, { subject: "jobs.x" }, "user:bob");
      const [lease] = queue.claim(P, "work", ann);
      if (!lease) throw new Error("no lease");
      return lease;
    },
  };
}

describe("job log", () => {
  it("stamps entries written in the same millisecond strictly increasing", () => {
    const { queue, lease } = setup();
    const { id } = lease();
    for (let i = 0; i < 3; i++) queue.renew(id, "user:ann", { progress: i });
    const stamps = queue.job(P, id, "user:ann").entries.map((e) => e.at);
    expect(stamps).toHaveLength(3);
    expect(stamps[0]).toBe(1_000_000);
    expect(stamps[1]).toBeGreaterThan(stamps[0] as number);
    expect(stamps[2]).toBeGreaterThan(stamps[1] as number);
    expect(Math.floor(stamps[2] as number)).toBe(1_000_000);
  });

  it("returns only the entries after a stamp", () => {
    const { queue, lease, advance } = setup();
    const { id } = lease();
    queue.renew(id, "user:ann", { progress: "a" });
    advance(10);
    queue.renew(id, "user:ann", { progress: "b" });
    const [first] = queue.job(P, id, "user:ann").entries;
    const later = queue.job(P, id, "user:ann", { after: first?.at });
    expect(later.entries.map((e) => e.progress)).toEqual(["b"]);
    expect(queue.job(P, id, "user:ann", { after: 2_000_000 }).entries).toEqual([]);
  });

  it("waits for the next entry, and returns empty on timeout", async () => {
    const { queue, lease } = setup();
    const { id } = lease();
    queue.renew(id, "user:ann", { progress: "a" });
    const [first] = queue.job(P, id, "user:ann").entries;
    const waiting = queue.waitJob(P, id, "user:ann", { after: first?.at, wait_ms: 1_000 });
    setTimeout(() => queue.renew(id, "user:ann", { progress: "b" }), 5);
    expect((await waiting).entries.map((e) => e.progress)).toEqual(["b"]);
    const last = queue.job(P, id, "user:ann").entries.at(-1);
    const timedOut = await queue.waitJob(P, id, "user:ann", { after: last?.at, wait_ms: 10 });
    expect(timedOut.entries).toEqual([]);
  });

  it("does not wait once the job has ended", async () => {
    const { queue, lease } = setup();
    const { id } = lease();
    queue.ack(id, "user:ann");
    const end = queue.job(P, id, "user:ann").entries.at(-1);
    const started = Date.now();
    const after = await queue.waitJob(P, id, "user:ann", { after: end?.at, wait_ms: 5_000 });
    expect(after.entries).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("ends an acked job with `done`", () => {
    const { queue, lease } = setup();
    const { id } = lease();
    queue.renew(id, "user:ann", { progress: "half" });
    queue.ack(id, "user:ann");
    expect(queue.job(P, id, "user:ann").entries.at(-1)).toMatchObject({ outcome: "done" });
  });

  it("ends a released job, and one whose lease ran out, with `error`", () => {
    const { queue, lease, advance } = setup();
    const released = lease();
    queue.release(released.id, "user:ann", { reason: "boom" });
    expect(queue.job(P, released.id, "user:ann").entries.at(-1)).toMatchObject({
      outcome: "error",
      progress: { reason: "boom" },
    });
    const [again] = queue.claim(P, "work", ann);
    advance(6 * 60_000);
    queue.sweep(P);
    expect(queue.job(P, String(again?.id), "user:ann").entries.at(-1)).toMatchObject({
      outcome: "error",
      progress: { reason: "the lease ran out" },
    });
  });

  it("refuses progress after the job has ended", () => {
    const { queue, lease } = setup();
    const { id } = lease();
    queue.ack(id, "user:ann");
    expect(() => queue.renew(id, "user:ann", { progress: "late" })).toThrow(/^ENOENT/);
  });
});
