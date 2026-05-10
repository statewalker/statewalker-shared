import type { CommandDeclaration, CommandDefault } from "./types.js";

/**
 * Declare a typed command by stable string key.
 *
 * Returns a frozen `CommandDeclaration<P, R>` carrier. Pass to
 * `commands.call(decl, payload)` to dispatch and
 * `commands.listen(decl, fn)` to register a listener.
 *
 * The optional `defaultFn` is the per-declaration fallback. It runs
 * after the listener pass iff no listener claimed. Without a
 * `defaultFn`, the bus rejects unhandled commands with `Unhandled
 * command: <key>` (loud-fail by design). To opt into the
 * silent-pending pattern (e.g. dialog-attached-to-command), pass a
 * noop `() => {}`.
 *
 * @example
 *   export const PickFileCommand =
 *     defineCommand<PickFilePayload, PickFileResult>("platform:pick-file");
 *
 * @example  // silent-pending opt-in
 *   export const LoadFilesApiCommand =
 *     defineCommand<{ type: "memory" | "opfs" }, FilesApi>(
 *       "files:load-api",
 *       () => { },
 *     );
 */
export function defineCommand<P, R>(
  key: string,
  defaultFn?: CommandDefault<P, R>,
): CommandDeclaration<P, R> {
  return Object.freeze({ key, defaultFn });
}
