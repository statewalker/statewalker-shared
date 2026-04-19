import { describe, expect, it } from "vitest";
import { crockfordDecode, crockfordEncode } from "../src/crockford-base32.js";

describe("crockfordEncode", () => {
  it("encodes zero with padding", () => {
    expect(crockfordEncode(0n, 13)).toBe("0000000000000");
  });

  it("encodes small values with padding", () => {
    expect(crockfordEncode(1n, 5)).toBe("00001");
    expect(crockfordEncode(31n, 5)).toBe("0000Z");
    expect(crockfordEncode(32n, 5)).toBe("00010");
  });

  it("encodes max 64-bit value", () => {
    const max64 = (1n << 64n) - 1n;
    const encoded = crockfordEncode(max64, 13);
    expect(encoded).toHaveLength(13);
    expect(encoded).toBe("FZZZZZZZZZZZZ");
  });

  it("uses only Crockford alphabet characters", () => {
    const valid = /^[0-9A-HJKMNP-TV-Z]+$/;
    for (let i = 0n; i < 1000n; i++) {
      expect(crockfordEncode(i, 4)).toMatch(valid);
    }
  });

  it("produces fixed-length output regardless of value", () => {
    expect(crockfordEncode(0n, 13)).toHaveLength(13);
    expect(crockfordEncode(1n, 13)).toHaveLength(13);
    expect(crockfordEncode((1n << 64n) - 1n, 13)).toHaveLength(13);
  });
});

describe("crockfordDecode", () => {
  it("decodes zero", () => {
    expect(crockfordDecode("0000000000000")).toBe(0n);
  });

  it("decodes small values", () => {
    expect(crockfordDecode("00001")).toBe(1n);
    expect(crockfordDecode("0000Z")).toBe(31n);
    expect(crockfordDecode("00010")).toBe(32n);
  });

  it("is case-insensitive", () => {
    const upper = crockfordDecode("ABCDEF");
    const lower = crockfordDecode("abcdef");
    expect(upper).toBe(lower);
  });

  it("accepts visual substitutions (O→0, I/L→1)", () => {
    expect(crockfordDecode("O")).toBe(0n);
    expect(crockfordDecode("I")).toBe(1n);
    expect(crockfordDecode("L")).toBe(1n);
    expect(crockfordDecode("l")).toBe(1n);
  });

  it("throws on invalid characters", () => {
    expect(() => crockfordDecode("U")).toThrow("Invalid Crockford base32 character");
    expect(() => crockfordDecode("!")).toThrow("Invalid Crockford base32 character");
  });
});

describe("round-trip", () => {
  it("encode→decode preserves value", () => {
    const values = [0n, 1n, 255n, 65535n, (1n << 32n) - 1n, (1n << 64n) - 1n];
    for (const v of values) {
      expect(crockfordDecode(crockfordEncode(v, 13))).toBe(v);
    }
  });

  it("decode→encode preserves string", () => {
    const strings = ["0000000000000", "0000000000001", "FZZZZZZZZZZZZ"];
    for (const s of strings) {
      expect(crockfordEncode(crockfordDecode(s), 13)).toBe(s);
    }
  });
});

describe("lexicographic ordering", () => {
  it("lexicographic order matches numeric order", () => {
    const values = [0n, 1n, 31n, 32n, 1000n, 100000n, 1n << 32n, (1n << 64n) - 1n];
    const encoded = values.map((v) => crockfordEncode(v, 13));
    const sorted = [...encoded].sort();
    expect(sorted).toEqual(encoded);
  });

  it("sequential values produce correctly ordered strings", () => {
    const encoded: string[] = [];
    for (let i = 0n; i < 100n; i++) {
      encoded.push(crockfordEncode(i, 13));
    }
    for (let i = 1; i < encoded.length; i++) {
      expect(encoded[i - 1]! < encoded[i]!).toBe(true);
    }
  });
});
