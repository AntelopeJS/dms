import { type ZodType, type ZodTypeAny, type ZodTypeDef, z } from "zod";
import type { BlockOptionUi } from "./types";
import { UI_HINTS } from "./ui";

/**
 * A string option whose declared type is narrower than `string` — a
 * template-literal union such as a colour value, or a branded id. The schema
 * still validates as a string, so a builder UI keeps a text control.
 */
export function narrowString<T extends string>(): ZodType<T, ZodTypeDef, T> {
  const schema: ZodType<string, ZodTypeDef, string> = z.string();
  return schema as ZodType<T, ZodTypeDef, T>;
}

/**
 * An option the schema cannot describe structurally — a component instance, or
 * a shape only meaningful to the factory. It validates anything; pair it with a
 * `json` or `block` widget so the UI knows how to present it.
 */
export function opaqueOption<T>(): ZodType<T, ZodTypeDef, T> {
  return z.any() as ZodType<T, ZodTypeDef, T>;
}

/**
 * An opaque option the factory cannot do without. `z.any()` accepts
 * `undefined`, so a plain {@link opaqueOption} would let a missing required
 * value validate; this one refuses it.
 */
export function requiredOpaqueOption<T>(): ZodType<T, ZodTypeDef, T> {
  return z.custom<T>((value) => value !== undefined, {
    message: "Required",
  });
}

/**
 * Attach builder presentation hints to an option schema. The schema is returned
 * unchanged, so `ui()` wraps a declaration in place:
 *
 * ```typescript
 * icon: ui(z.string().optional(), { widget: "icon", group: "appearance" })
 * ```
 *
 * Hints live in a side table rather than in the schema, so validation and type
 * inference are untouched.
 */
export function ui<T extends ZodTypeAny>(schema: T, hints: BlockOptionUi): T {
  UI_HINTS.set(schema, hints);
  return schema;
}
