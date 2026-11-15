import type { ConfigObject } from "@antelopejs/interface-dms-builder";
import { resolveBlockTarget } from "./block-target";
import { editableOptions } from "./config-literal";
import { isError, openPage } from "./ops";
import { pageVersion } from "./page-structure";
import { isIdentifier, parseBlockPath } from "./paths";
import { findPageClass } from "./writable";

/**
 * Whether `name` can name a block: an identifier, as `composePage` requires.
 * A child named `a/b` would read, in a block path, as the child `b` of `a`.
 *
 * @param name The block's name
 */
export function isBlockName(name: string): boolean {
  return isIdentifier(name);
}

/** The options a block's patch is merged into, as `configureBlock` reads them. */
export interface ConfigureTargetOptions {
  /** The literal options the patch is merged over. */
  config: ConfigObject;
  /** The options written in code, which `config` leaves out. */
  locked: string[];
  /** The page's version these options were read at, for `expectedVersion`. */
  version: string;
}

/**
 * The options `configureBlock` would merge a patch into at `path`, found by
 * the same resolution it runs, or `undefined` when it would write none: a
 * path that names no block, or a block whose options it cannot edit. Reads
 * only.
 *
 * @param path A block path, `<pageRef>#<name>[/<child>...]`
 */
export function configureTargetOptions(
  path: string,
): ConfigureTargetOptions | undefined {
  const parsed = parseBlockPath(path);
  if (!parsed) return undefined;
  const context = openPage(parsed.pageRef);
  if (isError(context)) return undefined;
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) return undefined;
  const resolved = resolveBlockTarget(cls, parsed.segments);
  if (!resolved.ok || !resolved.target.editable) return undefined;
  const { config, lockedOptions, reason } = editableOptions(
    resolved.target.optionsObj,
  );
  return reason === undefined
    ? {
        config,
        locked: Object.keys(lockedOptions),
        version: pageVersion(context.sourceFile),
      }
    : undefined;
}
