import { toJsonSchema } from "@standard-community/standard-json";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { isPassthrough } from "./passthrough.js";
import type { DispatchPolicy } from "./policy.js";
import type { CommandDeclaration } from "./types.js";

interface BuilderState {
  readonly key: string;
  readonly policy: DispatchPolicy;
  inputSchema?: StandardSchemaV1<unknown, unknown>;
  outputSchema?: StandardSchemaV1<unknown, unknown>;
  label?: string;
  description?: string;
  icon?: string;
}

/**
 * Builder before `.input` is set. Only exposes `.input`.
 */
export interface PolicyChosen {
  input<S extends StandardSchemaV1>(schema: S): InputSet<StandardSchemaV1.InferOutput<S>>;
}

/**
 * Builder after `.input` is set, before `.output`. Only exposes `.output`.
 */
export interface InputSet<P> {
  output<S extends StandardSchemaV1>(schema: S): Buildable<P, StandardSchemaV1.InferOutput<S>>;
}

/**
 * Builder with both schemas set. Exposes UX metadata setters and `.build()`.
 */
export interface Buildable<P, R> {
  label(value: string): Buildable<P, R>;
  description(value: string): Buildable<P, R>;
  icon(value: string): Buildable<P, R>;
  build(): CommandDeclaration<P, R>;
}

/**
 * Each stage returns a new builder over a copy of the state, so branching
 * from a shared stage (`const base = Command.required(k).input(s)`) never
 * leaks one branch's schemas or metadata into another.
 */
class CommandBuilder implements PolicyChosen, InputSet<unknown>, Buildable<unknown, unknown> {
  private readonly _state: Readonly<BuilderState>;

  constructor(state: BuilderState) {
    this._state = Object.freeze({ ...state });
  }

  private _with(patch: Partial<BuilderState>): CommandBuilder {
    return new CommandBuilder({ ...this._state, ...patch });
  }

  private _setOnce(field: "label" | "description" | "icon", value: string): CommandBuilder {
    if (this._state[field] !== undefined) {
      throw new Error(`Command "${this._state.key}": ${field} already set`);
    }
    return this._with({ [field]: value });
  }

  input<S extends StandardSchemaV1>(schema: S): InputSet<StandardSchemaV1.InferOutput<S>> {
    return this._with({
      inputSchema: schema as StandardSchemaV1<unknown, unknown>,
    }) as unknown as InputSet<StandardSchemaV1.InferOutput<S>>;
  }

  output<S extends StandardSchemaV1>(
    schema: S,
  ): Buildable<unknown, StandardSchemaV1.InferOutput<S>> {
    return this._with({
      outputSchema: schema as StandardSchemaV1<unknown, unknown>,
    }) as unknown as Buildable<unknown, StandardSchemaV1.InferOutput<S>>;
  }

  label(value: string): CommandBuilder {
    return this._setOnce("label", value);
  }

  description(value: string): CommandBuilder {
    return this._setOnce("description", value);
  }

  icon(value: string): CommandBuilder {
    return this._setOnce("icon", value);
  }

  build(): CommandDeclaration<unknown, unknown> {
    const { key, policy, inputSchema, outputSchema, label, description, icon } = this._state;
    if (!inputSchema || !outputSchema) {
      throw new Error(
        `Command "${key}": .input(...) and .output(...) must be called before .build()`,
      );
    }
    let inputJsonCache: Promise<Record<string, unknown>> | undefined;
    let outputJsonCache: Promise<Record<string, unknown>> | undefined;
    const decl: CommandDeclaration<unknown, unknown> = Object.freeze({
      key,
      policy,
      inputSchema,
      outputSchema,
      get inputJsonSchema() {
        if (!inputJsonCache) {
          inputJsonCache = deriveJsonSchema(inputSchema);
        }
        return inputJsonCache;
      },
      get outputJsonSchema() {
        if (!outputJsonCache) {
          outputJsonCache = deriveJsonSchema(outputSchema);
        }
        return outputJsonCache;
      },
      ...(label !== undefined ? { label } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(icon !== undefined ? { icon } : {}),
    });
    return decl;
  }
}

/**
 * `passthrough()` accepts any value, so its JSON Schema is `{}` (the
 * schema every value satisfies); `@standard-community/standard-json` does
 * not know the `passthrough` vendor and would reject.
 */
function deriveJsonSchema(
  schema: StandardSchemaV1<unknown, unknown>,
): Promise<Record<string, unknown>> {
  if (isPassthrough(schema)) return Promise.resolve({});
  return Promise.resolve(toJsonSchema.async(schema)) as Promise<Record<string, unknown>>;
}

export function createBuilder(key: string, policy: DispatchPolicy): PolicyChosen {
  return new CommandBuilder({ key, policy });
}
