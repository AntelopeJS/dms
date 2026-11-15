import { runInThisContext } from "node:vm";
import { z } from "zod";
import {
  isFunction,
  isObject,
} from "../../layers/dms-core/app/utils/type-check";

type ZodFields = Record<string, z.ZodTypeAny>;

function isZodObject(value: unknown): value is z.ZodObject<ZodFields> {
  if (!(value instanceof z.ZodObject)) return false;
  const fields: unknown = value.shape;
  return (
    isObject(fields) &&
    Object.values(fields).every((field) => field instanceof z.ZodType)
  );
}

/**
 * Evaluates the source `json-schema-to-zod` writes for an object schema, with
 * `z` in scope, as the form pipeline rebuilds a field's stored schema.
 */
export function evaluateZodObject(source: string): z.ZodObject<ZodFields> {
  const build: unknown = runInThisContext(
    `(function (z) { "use strict"; return (${source}); })`,
  );
  if (!isFunction(build)) throw new TypeError("the source builds no function");
  const built: unknown = build(z);
  if (!isZodObject(built)) throw new TypeError("the source builds no object");
  return built;
}
