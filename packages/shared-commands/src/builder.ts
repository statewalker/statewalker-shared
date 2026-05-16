import { toJsonSchema } from "@standard-community/standard-json";
import type { StandardSchemaV1 } from "@standard-schema/spec";
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

class CommandBuilder implements PolicyChosen, InputSet<unknown>, Buildable<unknown, unknown> {
  private readonly _state: BuilderState;

  constructor(state: BuilderState) {
    this._state = state;
  }

  input<S extends StandardSchemaV1>(schema: S): InputSet<StandardSchemaV1.InferOutput<S>> {
    this._state.inputSchema = schema as StandardSchemaV1<unknown, unknown>;
    return this as unknown as InputSet<StandardSchemaV1.InferOutput<S>>;
  }

  output<S extends StandardSchemaV1>(
    schema: S,
  ): Buildable<unknown, StandardSchemaV1.InferOutput<S>> {
    this._state.outputSchema = schema as StandardSchemaV1<unknown, unknown>;
    return this as unknown as Buildable<unknown, StandardSchemaV1.InferOutput<S>>;
  }

  label(value: string): this {
    if (this._state.label !== undefined) {
      throw new Error(`Command "${this._state.key}": label already set`);
    }
    this._state.label = value;
    return this;
  }

  description(value: string): this {
    if (this._state.description !== undefined) {
      throw new Error(`Command "${this._state.key}": description already set`);
    }
    this._state.description = value;
    return this;
  }

  icon(value: string): this {
    if (this._state.icon !== undefined) {
      throw new Error(`Command "${this._state.key}": icon already set`);
    }
    this._state.icon = value;
    return this;
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
          inputJsonCache = Promise.resolve(toJsonSchema.async(inputSchema)) as Promise<
            Record<string, unknown>
          >;
        }
        return inputJsonCache;
      },
      get outputJsonSchema() {
        if (!outputJsonCache) {
          outputJsonCache = Promise.resolve(toJsonSchema.async(outputSchema)) as Promise<
            Record<string, unknown>
          >;
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

export function createBuilder(key: string, policy: DispatchPolicy): PolicyChosen {
  return new CommandBuilder({ key, policy });
}
