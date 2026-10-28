import { isObject } from "../../../../../dms-core/app/utils/type-check";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Raw dotted-path overrides can replace any section with arbitrary JSON or text; ApexOptions indexed access cannot describe this existing unchecked escape hatch, and inferred builders exclude user-defined keys.
export type RawOptionSection = Record<string, unknown>;

const RAW_OPTION_PATH_SEPARATOR = ".";

// oxlint-disable-next-line anti-slop/no-unknown-returns -- JSON.parse accepts arbitrary user JSON here; validating as ApexOptions would reject currently supported raw overrides.
function parseRawOptionValue(value: string): unknown {
  try {
    return JSON.parse(value);
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
  value: ReturnType<typeof parseRawOptionValue>,
): Parameters<typeof injectRawOptions>[0] {
  const [head, ...rest] = path;
  if (head === undefined) return options;
  if (rest.length === 0) return { ...options, [head]: value };
  const section = isOptionSection(options[head]) ? options[head] : {};
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
