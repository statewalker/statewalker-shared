/**
 * Stateless snowflake ID parsing and conversion utilities.
 *
 * Supports three formats:
 * - Crockford base32 (13 chars, current) — lexicographically sortable
 * - Hex (11-16 chars, legacy) — unpadded BigInt.toString(16)
 * - Decimal (17+ chars) — BigInt.toString()
 */

import { crockfordDecode } from "./crockford-base32.js";
import { SNOWFLAKE_BASE32_LENGTH } from "./snowflake-id.js";

export interface SnowflakeParts {
  timestamp: number;
  workerId: number;
  sequence: number;
}

const DEFAULT_EPOCH = 1609459200000; // 2021-01-01T00:00:00Z

function partsFromBigInt(id: bigint): SnowflakeParts {
  return {
    timestamp: Number(id >> 22n),
    workerId: Number((id >> 12n) & 0x3ffn),
    sequence: Number(id & 0xfffn),
  };
}

/** Parse a Crockford base32 encoded snowflake ID into its component parts. */
export function parseSnowflakeBase32(base32: string): SnowflakeParts {
  return partsFromBigInt(crockfordDecode(base32));
}

/** Parse a hex-encoded snowflake ID into its component parts (legacy format). */
export function parseSnowflakeHex(hex: string): SnowflakeParts {
  return partsFromBigInt(BigInt(`0x${hex}`));
}

/** Parse a decimal snowflake ID into its component parts. */
export function parseSnowflakeDec(decimal: string): SnowflakeParts {
  return partsFromBigInt(BigInt(decimal));
}

/**
 * Auto-detect format and parse a snowflake ID.
 * - 13 chars → Crockford base32 (current format)
 * - Contains [a-f] or ≤16 chars → hex (legacy)
 * - Longer → decimal
 */
export function parseSnowflake(id: string): SnowflakeParts {
  if (id.length === SNOWFLAKE_BASE32_LENGTH) {
    return parseSnowflakeBase32(id);
  }
  const isHex = /[a-f]/i.test(id) || id.length <= 16;
  return isHex ? parseSnowflakeHex(id) : parseSnowflakeDec(id);
}

/**
 * Extract the absolute timestamp (ms since Unix epoch) from a snowflake ID.
 * Auto-detects format.
 */
export function extractTime(id: string, epoch: number = DEFAULT_EPOCH): number {
  return parseSnowflake(id).timestamp + epoch;
}

/** Convert a decimal snowflake string to hex. */
export function snowflakeToHex(decimal: string): string {
  return BigInt(decimal).toString(16);
}

/** Convert a hex snowflake string to decimal. */
export function snowflakeToDecimal(hex: string): string {
  return BigInt(`0x${hex}`).toString();
}
