/**
 * SnowflakeId generator (stateful).
 * Based on https://github.com/dustinrouillard/snowflake-id (MIT License)
 * Modified to accept injectable clock for deterministic testing.
 * Returns Crockford base32 encoded IDs (13 chars, zero-padded, lexicographically sortable).
 *
 * For parsing/conversion, see snowflake-parse.ts (stateless functions).
 *
 * Browser-compatible: uses only BigInt and Date.now().
 */

import { crockfordEncode } from "./crockford-base32.js";

/** Length of a Crockford base32 encoded 64-bit snowflake ID. */
export const SNOWFLAKE_BASE32_LENGTH = 13;

export interface SnowflakeOptions {
  /** Custom epoch (default: 1609459200000 = 2021-01-01T00:00:00Z) */
  epoch?: number;
  /** Machine/worker ID (0-1023, default: 1) */
  workerId?: number;
  /** Function returning current timestamp in ms (default: Date.now) */
  now?: () => number;
}

export class SnowflakeId {
  private epoch: number;
  private workerId: number;
  private now: () => number;
  private sequence = 0;
  private lastTimestamp = -1;

  constructor(options: SnowflakeOptions = {}) {
    this.epoch = options.epoch ?? 1609459200000;
    this.workerId = options.workerId ?? 1;
    this.now = options.now ?? Date.now;
  }

  generate(): string {
    let timestamp = this.now() - this.epoch;

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & 0xfff; // 12-bit sequence
      if (this.sequence === 0) {
        // Sequence overflow — wait for next millisecond
        while (timestamp <= this.lastTimestamp) {
          timestamp = this.now() - this.epoch;
        }
      }
    } else {
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    // 42-bit timestamp | 10-bit worker ID | 12-bit sequence
    const id =
      (BigInt(timestamp) << 22n) |
      (BigInt(this.workerId) << 12n) |
      BigInt(this.sequence);

    return crockfordEncode(id, SNOWFLAKE_BASE32_LENGTH);
  }
}
