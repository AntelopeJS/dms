import { isIdentifier } from "./paths";

/**
 * Whether `name` can name a block: an identifier, as `composePage` requires.
 * A child named `a/b` would read, in a block path, as the child `b` of `a`.
 *
 * @param name The block's name
 */
export function isBlockName(name: string): boolean {
  return isIdentifier(name);
}
