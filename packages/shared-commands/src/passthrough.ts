import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * No-op Standard Schema that accepts any input as type `T` without
 * validation. For migrating v1 callers where types are typed via
 * TypeScript interfaces but no runtime validator is wired up yet.
 * Tighten by replacing with a real Standard-Schema-compliant validator
 * (Zod, Valibot, ArkType, …) when validation becomes desirable.
 */
export function passthrough<T>(): StandardSchemaV1<T, T> {
  return PASSTHROUGH as StandardSchemaV1<T, T>;
}

const PASSTHROUGH: StandardSchemaV1<unknown, unknown> = {
  "~standard": {
    version: 1,
    vendor: "passthrough",
    validate(value): StandardSchemaV1.Result<unknown> {
      return { value };
    },
  },
};
