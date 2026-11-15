import { describe, expect, it } from "vitest";
import { SNOWFLAKE_BASE32_LENGTH, SnowflakeId } from "../src/snowflake-id.js";
import {
  extractTime,
  parseSnowflake,
  parseSnowflakeBase32,
  parseSnowflakeDec,
  parseSnowflakeHex,
  snowflakeToDecimal,
  snowflakeToHex,
} from "../src/snowflake-parse.js";

describe("SnowflakeId.generate", () => {
  it("produces 13-character Crockford base32 strings", () => {
    const gen = new SnowflakeId();
    const id = gen.generate();
    expect(id).toHaveLength(SNOWFLAKE_BASE32_LENGTH);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{13}$/);
  });

  it("produces unique IDs", () => {
    const gen = new SnowflakeId();
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(gen.generate());
    }
    expect(ids.size).toBe(100);
  });

  it("produces lexicographically increasing IDs over time", () => {
    let time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });

    const id1 = gen.generate();
    time += 1;
    const id2 = gen.generate();
    time += 100;
    const id3 = gen.generate();

    expect(id1 < id2).toBe(true);
    expect(id2 < id3).toBe(true);
  });

  it("produces increasing IDs within the same millisecond (sequence)", () => {
    const time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });

    const id1 = gen.generate();
    const id2 = gen.generate();
    const id3 = gen.generate();

    expect(id1 < id2).toBe(true);
    expect(id2 < id3).toBe(true);
  });

  it("lexicographic sort equals chronological sort", () => {
    let time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });
    const ids: string[] = [];

    for (let i = 0; i < 50; i++) {
      ids.push(gen.generate());
      if (i % 5 === 0) time += 1;
    }

    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });
});

describe("SnowflakeId with a clock that steps back (#28)", () => {
  it("keeps IDs strictly increasing and unique when the clock goes backwards", () => {
    const t = 1700000000000;
    const times = [t, t, t - 1, t];
    let i = 0;
    const gen = new SnowflakeId({ now: () => times[i++] ?? t });
    const ids = times.map(() => gen.generate());

    for (let k = 1; k < ids.length; k++) {
      expect((ids[k - 1] ?? "") < (ids[k] ?? "")).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps issuing at the last timestamp while the clock is behind", () => {
    let time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });
    const a = gen.generate();
    time -= 5000;
    const b = gen.generate();

    const pa = parseSnowflakeBase32(a);
    const pb = parseSnowflakeBase32(b);
    expect(pb.timestamp).toBe(pa.timestamp);
    expect(pb.sequence).toBe(pa.sequence + 1);
  });

  it("resumes at the wall clock once it passes the last timestamp", () => {
    let time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });
    gen.generate();
    time -= 10;
    gen.generate();
    time += 20;
    const c = parseSnowflakeBase32(gen.generate());
    expect(c.timestamp).toBe(time - 1609459200000);
    expect(c.sequence).toBe(0);
  });
});

describe("SnowflakeId sequence overflow (#28)", () => {
  it("advances to the next millisecond instead of spinning on a frozen clock", () => {
    const time = 1700000000000;
    let calls = 0;
    const gen = new SnowflakeId({
      now: () => {
        if (++calls > 10_000) throw new Error("generate() spins on the clock");
        return time;
      },
    });
    const ids: string[] = [];
    for (let k = 0; k < 4097; k++) ids.push(gen.generate());

    const last = parseSnowflakeBase32(ids[4096] ?? "");
    expect(last.timestamp).toBe(time - 1609459200000 + 1);
    expect(last.sequence).toBe(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("stays monotonic across several overflows with a frozen clock", () => {
    const time = 1700000000000;
    let calls = 0;
    const gen = new SnowflakeId({
      now: () => {
        if (++calls > 20_000) throw new Error("generate() spins on the clock");
        return time;
      },
    });
    const ids: string[] = [];
    for (let k = 0; k < 3 * 4096 + 10; k++) ids.push(gen.generate());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("SnowflakeId validation (#37)", () => {
  it("accepts workerId 0 and 1023 and round-trips them", () => {
    const time = 1700000000000;
    for (const workerId of [0, 1023]) {
      const id = new SnowflakeId({ now: () => time, workerId }).generate();
      const parts = parseSnowflakeBase32(id);
      expect(parts.workerId).toBe(workerId);
      expect(parts.timestamp).toBe(time - 1609459200000);
    }
  });

  it("rejects workerId outside 0-1023 or not an integer", () => {
    for (const workerId of [-1, 1024, 1.5, Number.NaN]) {
      expect(() => new SnowflakeId({ workerId })).toThrow(RangeError);
    }
  });

  it("rejects an epoch that is not a safe integer", () => {
    for (const epoch of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => new SnowflakeId({ epoch })).toThrow(RangeError);
    }
  });

  it("throws when the clock is before the epoch", () => {
    const gen = new SnowflakeId({ epoch: 1000, now: () => 999 });
    expect(() => gen.generate()).toThrow(/before the epoch/);
  });

  it("accepts a clock exactly at the epoch", () => {
    const gen = new SnowflakeId({ epoch: 1000, now: () => 1000 });
    expect(parseSnowflakeBase32(gen.generate()).timestamp).toBe(0);
  });

  it("throws when the clock returns a non-integer", () => {
    const gen = new SnowflakeId({ now: () => 1700000000000.5 });
    expect(() => gen.generate()).toThrow(RangeError);
  });

  it("throws when the timestamp no longer fits in 42 bits", () => {
    const gen = new SnowflakeId({ epoch: 0, now: () => 2 ** 42 });
    expect(() => gen.generate()).toThrow(/42 bits/);
  });

  it("does not repeat an ID after hitting the 42-bit limit on overflow", () => {
    const max = 2 ** 42 - 1;
    const gen = new SnowflakeId({ epoch: 0, now: () => max });
    const ids = new Set<string>();
    for (let k = 0; k < 4096; k++) ids.add(gen.generate());
    expect(() => gen.generate()).toThrow(/42 bits/);
    expect(() => gen.generate()).toThrow(/42 bits/);
    expect(ids.size).toBe(4096);
  });
});

describe("parseSnowflakeBase32", () => {
  it("round-trips through generate and parse", () => {
    const time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time, workerId: 7 });
    const id = gen.generate();

    const parts = parseSnowflakeBase32(id);
    expect(parts.timestamp).toBe(time - 1609459200000);
    expect(parts.workerId).toBe(7);
    expect(parts.sequence).toBe(0);
  });
  it("rejects input that is not 13 characters", () => {
    expect(() => parseSnowflakeBase32("")).toThrow(/13 characters/);
    expect(() => parseSnowflakeBase32("0AH99QR00040")).toThrow(/13 characters/);
    expect(() => parseSnowflakeBase32("0AH99QR0004000")).toThrow(/13 characters/);
  });

  it("rejects a 13-character value wider than 64 bits", () => {
    expect(parseSnowflakeBase32("FZZZZZZZZZZZZ").sequence).toBe(0xfff);
    expect(() => parseSnowflakeBase32("G000000000000")).toThrow(/64 bits/);
    expect(() => parseSnowflake("ZZZZZZZZZZZZZ")).toThrow(/64 bits/);
  });
});

describe("parseSnowflake (auto-detect)", () => {
  it("detects 13-char strings as Crockford base32", () => {
    const time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time, workerId: 3 });
    const id = gen.generate();

    expect(id).toHaveLength(13);
    const parts = parseSnowflake(id);
    expect(parts.workerId).toBe(3);
  });

  it("detects non-13-char strings as hex (legacy)", () => {
    const timestamp = 90540800000n;
    const workerId = 1n;
    const sequence = 0n;
    const raw = (timestamp << 22n) | (workerId << 12n) | sequence;
    const hex = raw.toString(16);

    expect(hex.length).not.toBe(13);
    const parts = parseSnowflake(hex);
    expect(parts.timestamp).toBe(Number(timestamp));
    expect(parts.workerId).toBe(1);
  });

  it("detects 17+ digit strings as decimal", () => {
    const raw = (90540800000n << 22n) | (5n << 12n) | 9n;
    const dec = raw.toString();
    expect(dec.length).toBeGreaterThanOrEqual(17);
    expect(parseSnowflake(dec)).toEqual({ timestamp: 90540800000, workerId: 5, sequence: 9 });
  });

  it("detects 16-char hex strings as hex", () => {
    const hex = "ffffffffffffffff";
    expect(hex).toHaveLength(16);
    const parts = parseSnowflake(hex);
    expect(parts.timestamp).toBeGreaterThan(0);
  });
});

describe("parseSnowflakeHex / parseSnowflakeDec", () => {
  it("parseSnowflakeHex extracts parts", () => {
    const id = (3000n << 22n) | (42n << 12n) | 5n;
    const parts = parseSnowflakeHex(id.toString(16));
    expect(parts.timestamp).toBe(3000);
    expect(parts.workerId).toBe(42);
    expect(parts.sequence).toBe(5);
  });

  it("parseSnowflakeDec extracts parts", () => {
    const id = (3000n << 22n) | (42n << 12n) | 5n;
    const parts = parseSnowflakeDec(id.toString());
    expect(parts.timestamp).toBe(3000);
    expect(parts.workerId).toBe(42);
    expect(parts.sequence).toBe(5);
  });
});

describe("extractTime", () => {
  it("extracts absolute timestamp from Crockford base32 ID", () => {
    const time = 1700000000000;
    const gen = new SnowflakeId({ now: () => time });
    const id = gen.generate();

    expect(extractTime(id)).toBe(time);
  });

  it("extracts absolute timestamp from legacy hex ID", () => {
    const time = 1700000000000;
    const offset = time - 1609459200000;
    const raw = (BigInt(offset) << 22n) | (1n << 12n) | 0n;
    const hex = raw.toString(16);

    expect(extractTime(hex)).toBe(time);
  });
});

describe("snowflakeToHex / snowflakeToDecimal", () => {
  it("round-trips between hex and decimal", () => {
    const id = (12345n << 22n) | (7n << 12n) | 99n;
    const hex = id.toString(16);
    const dec = id.toString();

    expect(snowflakeToDecimal(hex)).toBe(dec);
    expect(snowflakeToHex(dec)).toBe(hex);
  });
});
