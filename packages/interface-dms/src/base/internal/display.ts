import { z } from "zod";
import { resolveToneAlias } from "../types/internal/tone";

/**
 * Shared vocabulary of the display blocks — StatStrip, KeyValueList,
 * NavCardGrid, EmptyState, Banner, Card, Meter, ActivityFeed: the tones they
 * read, the link buttons they offer, the data source and the empty state of a
 * list block.
 */

/**
 * A zod enum of tones that also reads the deprecated tone names, so a page
 * saved with `accent` keeps its colour.
 *
 * @internal
 */
export const toneEnum = <T extends readonly [string, ...string[]]>(tones: T) =>
  z.preprocess(resolveToneAlias, z.enum(tones)) as z.ZodEffects<
    z.ZodEnum<[T[number], ...T[number][]]>,
    T[number],
    T[number]
  >;
