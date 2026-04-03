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
