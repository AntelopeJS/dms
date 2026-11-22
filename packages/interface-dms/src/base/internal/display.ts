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
export const toneEnum = <T extends readonly [string, ...string[]]>(
  tones: T,
): z.ZodEnum<{ [K in T[number]]: K }> => z.enum(tones);
