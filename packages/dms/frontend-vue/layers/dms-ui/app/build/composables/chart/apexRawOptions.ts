import type { ApexOptions } from "apexcharts";
import { toRaw } from "vue";
import {
  isBigint,
  isBoolean,
  isFunction,
  isNull,
  isNumber,
  isObject,
  isString,
  isSymbol,
  isUndefined,
} from "../../../../../dms-core/app/utils/type-check";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";

type ApexFunction = typeof isFunction extends (
  value: unknown,
) => value is infer F
  ? F
  : never;

/** A value Apex is handed: its options and series, formatters and dates included. */
export type ApexInput =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | ApexFunction
  | ApexInput[]
  | RawOptionSection;

/** A section of Apex's options (`chart`, `xaxis`, …), or the options themselves. */
export interface RawOptionSection {
  [option: string]: ApexInput;
}

/** A value an override is written as: JSON, or the text itself when it is not JSON. */
type RawOptionJson =
  | string
  | number
  | boolean
  | null
  | RawOptionJson[]
  | { readonly [option: string]: RawOptionJson };

const RAW_OPTION_PATH_SEPARATOR = ".";

function isRawOptionJson(value: unknown): value is RawOptionJson {
  if (
    value === null ||
    isString(value) ||
    isNumber(value) ||
    isBoolean(value)
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isRawOptionJson);
  return isObject(value) && Object.values(value).every(isRawOptionJson);
}

function parseRawOptionValue(value: string): RawOptionJson {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRawOptionJson(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

function isApexLeaf(
  value: unknown,
): value is Exclude<ApexInput, ApexInput[] | RawOptionSection> {
  return (
    isString(value) ||
    isNumber(value) ||
    isBoolean(value) ||
    isBigint(value) ||
    isSymbol(value) ||
    isNull(value) ||
    isUndefined(value) ||
    isFunction(value) ||
    value instanceof Date
  );
}

/**
 * A plain copy of a value handed to Apex, out of any Vue proxy. Functions
 * (formatters, event handlers) and dates are kept as they are.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Recursive copy of the untyped series and Apex options: each nested value it walks is only known once isApexLeaf, Array.isArray or isObject classifies it.
export function toApexInput(value: unknown): ApexInput {
  const raw = toRaw(value);
  if (isApexLeaf(raw)) return raw;
  if (Array.isArray(raw)) {
    return raw.map((entry) => toApexInput(entry));
  }
  const copy: RawOptionSection = {};
  if (isObject(raw)) {
    for (const [key, entry] of Object.entries(raw)) {
      copy[key] = toApexInput(entry);
    }
  }
  return copy;
}

function isOptionSection(value: ApexInput): value is RawOptionSection {
  return isObject(value) && value !== null && !Array.isArray(value);
}

/** Copies each section on a dotted path, replacing the final value. */
function setOptionPath(
  options: RawOptionSection,
  path: string[],
  value: RawOptionJson,
): RawOptionSection {
  const [head, ...rest] = path;
  if (head === undefined) return options;
  if (rest.length === 0) return { ...options, [head]: value };
  const current = Object.hasOwn(options, head) ? options[head] : undefined;
  const section = isOptionSection(current) ? current : {};
  return { ...options, [head]: setOptionPath(section, rest, value) };
}

/** Applies raw overrides without mutating generated options. */
export function injectRawOptions(
  options: ApexOptions,
  rawOptions: UseApexChartInput["rawOptions"],
): RawOptionSection {
  const copy: RawOptionSection = {};
  for (const [key, entry] of Object.entries(options)) {
    copy[key] = toApexInput(entry);
  }
  return (rawOptions ?? []).reduce(
    (merged, entry) =>
      setOptionPath(
        merged,
        entry.key.split(RAW_OPTION_PATH_SEPARATOR),
        parseRawOptionValue(entry.value),
      ),
    copy,
  );
}
