import type { PeriodPreset } from "#dms-core/app/composables/period/types";

/**
 * Short mono codes, as trails in the preset list and segmented labels: every
 * preset has one, so a row of segments stays as narrow with `all` as without
 * it, where the full label ("All time") widened it. Custom has none: it shows
 * its range. Each is translated under `dms.period.short_presets.<preset>`
 * ("24 h", "7 j" in French); these English codes are the fallback for a
 * locale that lacks one, and the list of presets that have a code.
 *
 * @internal
 */
export const PRESET_SHORT_LABELS: Partial<Record<PeriodPreset, string>> = {
  "last-hour": "1H",
  "last-24h": "24H",
  today: "1D",
  yesterday: "-1D",
  "last-7-days": "7D",
  "last-30-days": "30D",
  "last-90-days": "90D",
  "this-month": "MTD",
  "last-month": "-1M",
  "this-quarter": "QTD",
  "last-quarter": "-1Q",
  ytd: "YTD",
  "last-year": "-1Y",
  all: "ALL",
};
