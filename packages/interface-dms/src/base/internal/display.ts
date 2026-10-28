import { z } from "zod";

/**
 * Shared vocabulary of the display blocks — StatGroup, KeyValueList,
 * NavCardGrid, EmptyState, Banner, Card, Meter, ActivityFeed: the tones they
 * read, the link buttons they offer, the data source and the empty state of a
 * list block.
 */

/**
 * A zod enum of tones.
 *
 * @internal
 */
export const toneEnum = <T extends readonly [string, ...string[]]>(tones: T) =>
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The published helper accepts readonly tuples but exposes Zod's mutable enum tuple; preserve that unchecked mutability boundary and its inferred declaration.
  z.enum(tones as unknown as [T[number], ...T[number][]]);
