import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isObject } from "#dms-core/app/utils/type-check";

/** How many labels a multi-value relation cell shows before collapsing. */
export const MAX_RELATION_BADGES = 3;

/** The labels a multi-value cell shows, and how many it folds into `+N`. */
export interface RelationBadges {
  visible: string[];
  hidden: string[];
}

function readRelationLabel(
  item: Parameters<DataTypeFormatter>[0],
  labelKey: string,
): string {
  if (isObject(item) && item !== null) {
    const label = item[labelKey];
    return label === undefined || label === null ? "" : String(label);
  }
  return item === undefined || item === null ? "" : String(item);
}

/**
 * Split a multi-value relation into the labels rendered as badges and the ones
 * folded into a trailing `+N`. List rows carry the related rows resolved by the
 * relation join, so each item is read through the `label` key mapping; a raw id
 * (join skipped) is shown as is rather than dropped.
 */
export function buildRelationBadges(
  values: unknown[],
  labelKey: string,
  maxVisible = MAX_RELATION_BADGES,
): RelationBadges {
  const labels = values
    .map((item) => readRelationLabel(item, labelKey))
    .filter((label) => label !== "");
  return {
    visible: labels.slice(0, maxVisible),
    hidden: labels.slice(maxVisible),
  };
}
