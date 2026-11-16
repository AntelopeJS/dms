import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";

/** Any JSON value, so a parse hands back a typed value without an assertion. */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** A JSON object, keyed by property name. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

/** A JSON object, as {@link JsonObjectSchema} parses it. */
export type JsonObject = z.infer<typeof JsonObjectSchema>;
