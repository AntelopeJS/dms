import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";

export type RawOptionSection = Record<string, unknown>;

/** A value an override is written as: JSON, or the text itself when it is not JSON. */
type RawOptionJson =
  | string
  | number
  | boolean
  | null
  | readonly RawOptionJson[]
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

function isOptionSection(value: unknown): value is RawOptionSection {
  return isObject(value) && value !== null && !Array.isArray(value);
}

/** Copies each section on a dotted path, replacing the final value. */
function setOptionPath(
  options: RawOptionSection,
  path: string[],
  value: RawOptionJson,
): Parameters<typeof injectRawOptions>[0] {
  const [head, ...rest] = path;
  if (head === undefined) return options;
  if (rest.length === 0) return { ...options, [head]: value };
  const current = Object.hasOwn(options, head) ? options[head] : undefined;
  const section = isOptionSection(current) ? current : {};
  return { ...options, [head]: setOptionPath(section, rest, value) };
}

/** Applies raw overrides without mutating generated options. */
export function injectRawOptions(
  options: RawOptionSection,
  rawOptions: UseApexChartInput["rawOptions"],
): RawOptionSection {
  return (rawOptions ?? []).reduce(
    (merged, entry) =>
      setOptionPath(
        merged,
        entry.key.split(RAW_OPTION_PATH_SEPARATOR),
        parseRawOptionValue(entry.value),
      ),
    options,
  );
}
