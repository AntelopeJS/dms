import { z } from "zod";
import {
  type BlockText,
  COMPOSED_TEXT_DATE_FORMATS,
  COMPOSED_TEXT_NUMBER_FORMATS,
  type ComposedText,
  type ComposedTextParam,
} from "../types/composed-text";

const DateValueSchema = z.union([z.string(), z.number()]);

const TypedParamSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("money"),
    value: z.number(),
    currency: z.string(),
  }),
  z.object({
    type: z.literal("date"),
    value: DateValueSchema,
    format: z.enum(COMPOSED_TEXT_DATE_FORMATS).optional(),
  }),
  z.object({
    type: z.literal("datetime"),
    value: DateValueSchema,
    format: z.enum(COMPOSED_TEXT_DATE_FORMATS).optional(),
  }),
  z.object({ type: z.literal("relative"), value: DateValueSchema }),
  z.object({
    type: z.literal("number"),
    value: z.number(),
    format: z.enum(COMPOSED_TEXT_NUMBER_FORMATS).optional(),
  }),
  z.object({ type: z.literal("count"), value: z.number() }),
]);

// A parameter may itself be a composed text, so the two schemas name each
// other through `z.lazy`.
const ComposedTextParamSchema: z.ZodType<ComposedTextParam> = z.lazy(() =>
  z.union([z.string(), z.number(), TypedParamSchema, ComposedTextSchema]),
);

/**
 * The zod schema of a {@link ComposedText}.
 *
 * @internal
 */
export const ComposedTextSchema: z.ZodType<ComposedText> = z.object({
  key: z.string().min(1),
  params: z.record(ComposedTextParamSchema).optional(),
  plural: z.string().optional(),
});

/**
 * The schema of one value a composed text names, for an option that takes
 * such values on their own.
 *
 * @internal
 */
export const composedTextParamSchema = (): z.ZodType<ComposedTextParam> =>
  ComposedTextParamSchema;

/**
 * The schema of a block text option: a plain string or a composed text.
 *
 * @internal
 */
export const blockTextSchema = (): z.ZodType<BlockText> =>
  z.union([z.string(), ComposedTextSchema]);
