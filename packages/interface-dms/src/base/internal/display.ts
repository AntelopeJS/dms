import { z } from "zod";

/**
 * A zod enum of tones.
 *
 * @internal
 */
export const toneEnum = <T extends readonly [string, ...string[]]>(
  tones: T,
): z.ZodEnum<{ [K in T[number]]: K }> => z.enum(tones);
