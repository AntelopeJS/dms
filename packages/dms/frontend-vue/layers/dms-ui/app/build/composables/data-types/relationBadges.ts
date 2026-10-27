import { DEFAULT_RELATION_VALUE_KEY } from "./relationValue";

/** How many labels a multi-value relation cell shows before collapsing. */
export const MAX_RELATION_BADGES = 3;

/** The labels a multi-value cell shows, and how many it folds into `+N`. */
export interface RelationBadges {
  visible: string[];
  hidden: string[];
}

const textOf = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

/**
 * The text a related row shows: its label, or its key when the label is
 * empty. A raw id (join skipped) is shown as is.
 */
export function readRelationLabel(
  item: unknown,
  labelKey: string,
  valueKey = DEFAULT_RELATION_VALUE_KEY,
): string {
  if (typeof item === "object" && item !== null) {
    const row = item as Record<string, unknown>;
    return textOf(row[labelKey]) || textOf(row[valueKey]);
  }
  return textOf(item);
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
  valueKey = DEFAULT_RELATION_VALUE_KEY,
): RelationBadges {
  const labels = values
    .map((item) => readRelationLabel(item, labelKey, valueKey))
    .filter((label) => label !== "");
  return {
    visible: labels.slice(0, maxVisible),
    hidden: labels.slice(maxVisible),
  };
}
