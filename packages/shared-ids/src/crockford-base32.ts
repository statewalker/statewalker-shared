/**
 * Crockford's Base32 encoding/decoding for 64-bit integers.
 *
 * Alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (32 symbols)
 * - Excludes I, L, O, U to avoid ambiguity with 1, L, 0, V
 * - Case-insensitive on decode (lowercase accepted)
 * - 5 bits per character
 *
 * @see https://www.crockford.com/base32.html
 */

const ENCODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Decode map: character → value (0-31). Handles uppercase and lowercase. */
const DECODE_MAP = new Map<string, number>();
for (let i = 0; i < ENCODE_ALPHABET.length; i++) {
  const ch = ENCODE_ALPHABET.charAt(i);
  DECODE_MAP.set(ch, i);
  DECODE_MAP.set(ch.toLowerCase(), i);
}
// Crockford spec: accept common visual substitutions
DECODE_MAP.set("O", 0);
DECODE_MAP.set("o", 0);
DECODE_MAP.set("I", 1);
DECODE_MAP.set("i", 1);
DECODE_MAP.set("L", 1);
DECODE_MAP.set("l", 1);

/**
 * Encode a BigInt value as a Crockford base32 string, zero-padded to `length` characters.
 *
 * @param value Non-negative BigInt to encode, below `2 ** (5 * length)`
 * @param length Output string length (zero-padded on the left), a non-negative integer
 * @returns Crockford base32 string of exactly `length` characters
 * @throws RangeError if `length` is not a non-negative integer, or `value` is negative or
 *   does not fit in `length` characters
 */
export function crockfordEncode(value: bigint, length: number): string {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError(`Crockford base32 length must be a non-negative integer, got ${length}`);
  }
  if (value < 0n || value >> BigInt(5 * length) !== 0n) {
    throw new RangeError(`Value ${value} does not fit in ${length} Crockford base32 characters`);
  }
  let result = "";
  let v = value;
  for (let i = 0; i < length; i++) {
    result = ENCODE_ALPHABET.charAt(Number(v & 31n)) + result;
    v >>= 5n;
  }
  return result;
}

/**
 * Decode a Crockford base32 string to a BigInt value.
 * Case-insensitive. Accepts visual substitutions (O→0, I/L→1).
 *
 * @param str Non-empty Crockford base32 string
 * @returns Decoded BigInt value
 * @throws Error if the string is empty or contains invalid characters
 */
export function crockfordDecode(str: string): bigint {
  if (str.length === 0) {
    throw new Error("Cannot decode an empty Crockford base32 string");
  }
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i);
    const val = DECODE_MAP.get(ch);
    if (val === undefined) {
      throw new Error(`Invalid Crockford base32 character: '${ch}'`);
    }
    result = (result << 5n) | BigInt(val);
  }
  return result;
}
