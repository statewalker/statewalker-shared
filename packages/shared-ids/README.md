# @statewalker/shared-ids

## What it is

Browser-compatible identifier utilities:

- **Snowflake IDs** (`SnowflakeId`) — 64-bit lexicographically-sortable IDs
  encoded as 13-character Crockford base32.
- **Snowflake parsing** (`parseSnowflake` and friends) — decode current and
  legacy formats (Crockford base32, hex, decimal) back to their parts.
- **Crockford base32 codec** (`crockfordEncode` / `crockfordDecode`).
- **SHA-1 hashing** (`sha1Uuid` / `sha1Bytes`) — 40-character lowercase hex
  digests for deterministic content-addressable identifiers.

## Why it exists

Applications need identifiers that (a) sort the same lexicographically as
chronologically (so a `SELECT … ORDER BY id` query returns rows in creation
order), (b) survive copy-paste without ambiguity, and (c) work in the
browser without polyfills. UUIDs sort poorly. Plain hex snowflakes have
case-folding and visually-ambiguous-character issues. Crockford base32 fixes
both: 32 visually unambiguous characters, lexicographic sort identical to
the numeric sort.

This package bundles those primitives so every fragment uses the same
encoding, the same epoch, and the same parsing for legacy data.

## How to use

```sh
pnpm add @statewalker/shared-ids
```

```ts
import { SnowflakeId, parseSnowflake } from "@statewalker/shared-ids";

const gen = new SnowflakeId({ workerId: 1 });
const id = gen.generate(); // e.g. "1J9X4Z2P3K7M5"

const { timestamp, workerId, sequence } = parseSnowflake(id);
```

### Entry point

One entry point, `@statewalker/shared-ids` (ESM, `dist/index.js` with
types). No runtime dependencies. Uses only `BigInt`, `Date.now()` and the Web
Crypto API, so it works in browsers, Node and workers.

### API surface

- `SnowflakeId` — `new SnowflakeId({ epoch?, workerId?, now? })`, then
  `generate(): string` (13-character Crockford base32). Defaults: epoch
  `1609459200000` (2021-01-01T00:00:00Z), `workerId` `1`, `now` `Date.now`.
- `SnowflakeOptions`, `SnowflakeParts` (`{ timestamp, workerId, sequence }`) —
  types.
- `SNOWFLAKE_BASE32_LENGTH` — `13`.
- `parseSnowflake(id)` — auto-detects the format (see below).
- `parseSnowflakeBase32(id)`, `parseSnowflakeHex(id)`, `parseSnowflakeDec(id)`
  — parse a known format.
- `extractTime(id, epoch?)` — absolute timestamp (ms since the Unix epoch).
- `snowflakeToHex(decimal)`, `snowflakeToDecimal(hex)` — convert between the
  legacy formats.
- `crockfordEncode(value: bigint, length)`, `crockfordDecode(str): bigint`.
- `sha1Uuid(content: string): Promise<string>`,
  `sha1Bytes(data: Uint8Array): Promise<string>`.

Note that `parseSnowflake` returns `timestamp` relative to the epoch; use
`extractTime` to get an absolute time.

## Examples

### Generating sortable IDs

```ts
import { SnowflakeId } from "@statewalker/shared-ids";

const gen = new SnowflakeId();
const a = gen.generate();
const b = gen.generate();
a < b; // true — lexicographic order matches generation order
```

### Deterministic content-addressable ID

```ts
import { sha1Uuid } from "@statewalker/shared-ids";

const blockId = await sha1Uuid(JSON.stringify(payload));
// → 40-char lowercase hex, identical for identical payloads
```

### Reading the creation time

```ts
import { extractTime, SnowflakeId } from "@statewalker/shared-ids";

const id = new SnowflakeId().generate();
new Date(extractTime(id)); // creation time; pass the epoch if you used a custom one
```

### Crockford base32 directly

```ts
import { crockfordDecode, crockfordEncode } from "@statewalker/shared-ids";

crockfordEncode(12345n, 4); // "0C1S"
crockfordDecode("0c1s"); // 12345n (case-insensitive; O -> 0, I/L -> 1)
crockfordDecode("U"); // throws Error: Invalid Crockford base32 character: 'U'
```

### Decoding legacy hex snowflake IDs

```ts
import { parseSnowflake } from "@statewalker/shared-ids";

// Auto-detects format: 13-char → Crockford base32, otherwise hex / decimal
parseSnowflake("3a1ff0e0000000");
parseSnowflake("8194842620624998400"); // decimal
parseSnowflake("1J9X4Z2P3K7M5");        // Crockford base32
```

## Internals

### Snowflake bit layout

```
| 63                                  22 | 21        12 | 11   0 |
|-----------------------------------------|--------------|--------|
| 42-bit timestamp (ms since 2021-01-01) | 10-bit worker | 12-bit |
|                                         |              | seq    |
```

- 42-bit timestamp gives ~139 years from the configured epoch (default
  `2021-01-01T00:00:00Z`).
- 10-bit worker ID supports 1024 distinct generators (process / machine).
- 12-bit sequence — up to 4096 IDs per worker per millisecond. On overflow,
  the generator busy-waits for the next millisecond rather than corrupting
  ordering.

### Why Crockford base32 instead of hex or base64?

- **Lexicographic sort = numeric sort.** The alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (`I`, `L`, `O`, `U` removed) is in
  ASCII order for the 32 ranks.
  Sorting Crockford strings lexicographically produces the same order as
  sorting their decoded BigInt values.
- **Visually unambiguous.** Omitting `I`, `L`, `O`, `U` removes the most
  common transcription mistakes; the decoder also accepts the common
  substitutions (`O→0`, `I→1`, `L→1`) on input.
- **Fixed width.** A 64-bit value always encodes to exactly 13 base32
  characters when zero-padded, so concatenation and prefix searches work
  without ambiguity.

### Legacy format detection in `parseSnowflake`

- 13 characters → Crockford base32 (current format).
- Contains `[a-f]` or ≤16 characters → hex (legacy `BigInt.toString(16)`).
- Otherwise → decimal (`BigInt.toString()`).

This lets a store that holds IDs in several formats return them all, and
the caller still gets parsed parts.

### Constraints

- SHA-1 uses the global `crypto.subtle.digest` — available in modern
  browsers, workers and Node 24.
- The sequence counter is per-`SnowflakeId` instance. Multiple processes
  must have distinct `workerId`s, or two co-running generators on the same
  ms can mint the same ID.
- `parseSnowflake` treats every 13-character string as Crockford base32,
  and every string of 16 or fewer characters as hex. A 13-character hex ID,
  or a decimal ID of 16 or fewer digits, must be passed to
  `parseSnowflakeHex` / `parseSnowflakeDec` explicitly.

### Dependencies

Zero dependencies.

## License

MIT. See the monorepo root [LICENSE](../../LICENSE).
