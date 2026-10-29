import type { useApexChart } from "../../layers/dms-ui/app/composables/chart/useApexChart";
import {
  isFunction,
  isNull,
  isNumber,
  isObject,
  isString,
} from "../../layers/dms-core/app/utils/type-check";

type RawOptionSection = ReturnType<typeof useApexChart>["options"]["value"];

export interface AutoBounds {
  min: (value: number) => number;
  max: (value: number) => number;
}

/** A section of the options the chart built, which must be there. */
export function sectionIn(
  options: RawOptionSection,
  key: string,
): RawOptionSection {
  const section = options[key];
  if (!isObject(section) || isNull(section))
    throw new Error(`The chart options hold no ${key} section`);
  return section;
}

function callbackIn(owner: RawOptionSection, key: string) {
  const callback = owner[key];
  if (!isFunction(callback))
    throw new Error(`The chart options hold no ${key} callback`);
  return (value: number) => callback.call(owner, value);
}

function numberCallbackIn(
  owner: RawOptionSection,
  key: string,
): (value: number) => number {
  const callback = callbackIn(owner, key);
  return (value) => {
    const result = callback(value);
    if (!isNumber(result))
      throw new Error(`The ${key} callback answered ${String(result)}`);
    return result;
  };
}

/** The auto-range bounds callbacks of the options' Y axis. */
export function autoBoundsOf(options: RawOptionSection): AutoBounds {
  const yaxis = sectionIn(options, "yaxis");
  return {
    min: numberCallbackIn(yaxis, "min"),
    max: numberCallbackIn(yaxis, "max"),
  };
}

/** The formatter of the options' Y axis labels. */
export function yAxisLabelFormatter(
  options: RawOptionSection,
): (value: number) => string {
  const labels = sectionIn(sectionIn(options, "yaxis"), "labels");
  const formatter = callbackIn(labels, "formatter");
  return (value) => {
    const result = formatter(value);
    if (!isString(result))
      throw new Error(`The formatter answered ${String(result)}`);
    return result;
  };
}
