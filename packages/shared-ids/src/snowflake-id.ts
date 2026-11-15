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

/** Default epoch: 2021-01-01T00:00:00Z. */
const DEFAULT_EPOCH = 1609459200000;
/** Largest worker ID that fits in 10 bits. */
const MAX_WORKER_ID = 0x3ff;
/** Largest timestamp (ms since the epoch) that fits in 42 bits. */
const MAX_TIMESTAMP = 2 ** 42 - 1;
/** Largest sequence number that fits in 12 bits. */
const MAX_SEQUENCE = 0xfff;

export interface SnowflakeOptions {
  /** Custom epoch in ms since the Unix epoch (default: 1609459200000 = 2021-01-01T00:00:00Z) */
  epoch?: number;
  /** Machine/worker ID, an integer 0-1023 (default: 1) */
  workerId?: number;
  /** Function returning current timestamp in ms (default: Date.now) */
  now?: () => number;
}

/**
 * Stateful generator of 64-bit snowflake IDs.
 *
 * IDs from one instance are strictly increasing, even when the clock steps back (NTP step,
 * VM resume) or stands still: a timestamp behind the last one issued is treated as the last
 * one, and when the 12-bit sequence overflows the generator moves to the next millisecond
 * instead of waiting for the clock. In both cases the embedded timestamp can run slightly
 * ahead of the wall clock until the clock catches up.
 */
export class SnowflakeId {
  private epoch: number;
  private workerId: number;
  private now: () => number;
  private sequence = 0;
  private lastTimestamp = -1;

  /**
   * @throws RangeError if `workerId` is not an integer 0-1023 or `epoch` is not a safe integer
   */
  constructor(options: SnowflakeOptions = {}) {
    const epoch = options.epoch ?? DEFAULT_EPOCH;
    const workerId = options.workerId ?? 1;
    if (!Number.isSafeInteger(epoch)) {
      throw new RangeError(`Snowflake epoch must be a safe integer, got ${epoch}`);
    }
    if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
      throw new RangeError(
        `Snowflake workerId must be an integer 0-${MAX_WORKER_ID}, got ${workerId}`,
      );
    }
    this.epoch = epoch;
    this.workerId = workerId;
    this.now = options.now ?? Date.now;
  }

  /**
   * Generate the next ID: 13 characters of Crockford base32, greater than every ID this
   * instance generated before.
   *
   * @throws RangeError if the clock is before the epoch, is not an integer, or the timestamp
   *   no longer fits in 42 bits
   */
  generate(): string {
    const nowMs = this.now();
    if (!Number.isInteger(nowMs)) {
      throw new RangeError(`Snowflake clock must return integer milliseconds, got ${nowMs}`);
    }
    let timestamp = nowMs - this.epoch;
    if (timestamp < 0) {
      throw new RangeError(`Snowflake clock (${nowMs}) is before the epoch (${this.epoch})`);
    }

    let sequence = 0;
    if (timestamp <= this.lastTimestamp) {
      // Same millisecond, or the clock stepped back: stay on the last timestamp.
      timestamp = this.lastTimestamp;
      sequence = this.sequence + 1;
      if (sequence > MAX_SEQUENCE) {
        // Sequence overflow: borrow the next millisecond instead of spinning on the clock.
        timestamp++;
        sequence = 0;
      }
    }

    if (timestamp > MAX_TIMESTAMP) {
      throw new RangeError("Snowflake timestamp no longer fits in 42 bits");
    }
    this.lastTimestamp = timestamp;
    this.sequence = sequence;

    // 42-bit timestamp | 10-bit worker ID | 12-bit sequence
    const id = (BigInt(timestamp) << 22n) | (BigInt(this.workerId) << 12n) | BigInt(sequence);

    return crockfordEncode(id, SNOWFLAKE_BASE32_LENGTH);
  }
}
