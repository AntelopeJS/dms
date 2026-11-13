import type { ConfigValue } from "@antelopejs/interface-dms-builder";
import { isPlainObject } from "./value";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** An object key as TypeScript writes it: bare where it can be, quoted otherwise. */
export function keyText(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

type Scalar =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  | ((...args: never[]) => void);

function isScalar(value: unknown): value is Scalar {
  return typeof value !== "object" || value === null;
}

function arrayText(items: ConfigValue[], unit: string, base: string): string {
  if (items.every(isScalar)) {
    return `[${items.map((item) => literalText(item, unit, base)).join(", ")}]`;
  }
  const inner = base + unit;
  const lines = items.map(
    (item) => `${inner}${literalText(item, unit, inner)},`,
  );
  return `[\n${lines.join("\n")}\n${base}]`;
}

/**
 * A JSON-shaped value as a TypeScript literal, for a property whose line starts with `base`:
 * nested lines are indented one `unit` per level from there, and every entry keeps its comma.
 */
export function literalText(
  value: ConfigValue,
  unit: string,
  base = "",
): string {
  if (Array.isArray(value)) {
    return arrayText(value, unit, base);
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(
      ([, item]) => item !== undefined,
    );
    if (entries.length === 0) {
      return "{}";
    }
    const inner = base + unit;
    const lines = entries.map(
      ([key, item]) =>
        `${inner}${keyText(key)}: ${literalText(item, unit, inner)},`,
    );
    return `{\n${lines.join("\n")}\n${base}}`;
  }
  return JSON.stringify(value);
}
