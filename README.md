# @repo/ids

Zero-dependency ID generation and parsing utilities for the statewalker monorepo.

## What it is

A minimal package providing:

- **Snowflake ID generator** — 64-bit time-ordered unique IDs encoded as Crockford base32 (13 chars, lexicographically sortable)
- **Crockford base32** — encode/decode utilities for BigInt values
- **SHA1 UUID** — content-addressable hashing via Web Crypto API

## Why it exists

Snowflake IDs were originally embedded in `@repo/content-blocks`. Multiple packages (content-blocks, content-scanner, content-extractors, chat.core) needed ID generation, leading to code duplication. This package extracts ID utilities into a standalone, zero-dependency module.

The Snowflake encoding was also changed from unpadded hex (variable 11-16 chars, **broken lexicographic sort**) to Crockford base32 (fixed 13 chars, **correct lexicographic sort**). This is critical for systems that order records by ID string comparison.

## How to use

### Snowflake ID generation

```typescript
import { SnowflakeId } from "@repo/ids";

const gen = new SnowflakeId();
const id = gen.generate(); // "01HGXK4Y0W001" (13 chars, Crockford base32)

// With options
const gen2 = new SnowflakeId({
  epoch: 1609459200000,  // default: 2021-01-01T00:00:00Z
  workerId: 5,           // 0-1023, default: 1
  now: () => Date.now(),  // injectable clock for testing
});
```

### Parsing IDs

```typescript
import { parseSnowflake, extractTime, parseSnowflakeBase32 } from "@repo/ids";

// Auto-detect format (Crockford base32, hex, or decimal)
const parts = parseSnowflake("01HGXK4Y0W001");
// { timestamp: 90540800000, workerId: 1, sequence: 1 }

// Extract absolute timestamp (ms since Unix epoch)
const time = extractTime("01HGXK4Y0W001");
// 1700000000000

// Parse specific formats
const parts2 = parseSnowflakeBase32("01HGXK4Y0W001"); // Crockford base32
```

### Crockford base32

```typescript
import { crockfordEncode, crockfordDecode } from "@repo/ids";

const encoded = crockfordEncode(12345n, 13);  // "0000000009IX"
const decoded = crockfordDecode("0000000009IX"); // 12345n

// Case-insensitive, accepts visual substitutions (O→0, I/L→1)
crockfordDecode("o") === crockfordDecode("0") // true
crockfordDecode("l") === crockfordDecode("1") // true
```

### SHA1 UUID

```typescript
import { sha1Uuid, sha1Bytes } from "@repo/ids";

const hash = await sha1Uuid("hello world");
// "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed" (40-char hex)

const bytesHash = await sha1Bytes(new TextEncoder().encode("hello world"));
```

## Snowflake ID format

```
64-bit Snowflake ID
┌──────────────────────────┬──────────┬────────────┐
│  42-bit timestamp (ms)   │ 10-bit   │ 12-bit     │
│  since epoch             │ worker   │ sequence   │
│  (~139 years range)      │ (0-1023) │ (0-4095)   │
└──────────────────────────┴──────────┴────────────┘
                    ↓
        Crockford base32 encoding
        zero-padded to 13 characters
                    ↓
            "01HGXK4Y0W001"
```

**Properties:**
- 13 characters, fixed width
- Alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O, U)
- Lexicographic string comparison = chronological order
- Up to 4096 unique IDs per millisecond per worker
- Creation timestamp extractable from the ID

**Backward compatibility:** `parseSnowflake()` auto-detects format by string length — 13 chars = Crockford base32 (new), other lengths = hex (legacy).

## License

MIT
