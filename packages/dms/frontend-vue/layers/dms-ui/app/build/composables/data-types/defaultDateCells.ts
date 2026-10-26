import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { readRowField, type Row, toneClass } from "./cellHelpers";
import {
  firstNameOf,
  formatDayMonth,
  formatRelativeDate,
} from "../../utils/relativeDate";
import { serverRenderNow } from "#dms-core/app/build/composables/renderNow";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

const CELL_TEXT_CLASS = "text-[12.5px]";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

interface RelativeDateOptions {
  /** `relative` ("2 hr. ago", "In 5 days", default) or `day` ("Sep 27"). */
  style?: "relative" | "day";
  /** Text tone; see the cell tones. */
  tone?: string;
  /** A past date closer than this reads `nowLabel`, with a live dot. */
  nowWithinMs?: number;
  nowLabel?: string;
  /** Text and tone of a missing date. */
  emptyLabel?: string;
  emptyTone?: string;
  /** A future date closer than this takes `soonTone` (warning). */
  soonWithinMs?: number;
  soonTone?: string;
  /** Style and tone of a date already past (an expired invitation). */
  pastStyle?: "relative" | "day";
  pastTone?: string;
  /** Row field naming who acted: "Sep 27 · by Camille". */
  byField?: string;
  /** i18n key receiving `{ date, name }`. */
  byLabel?: string;
}

const RELATIVE_TITLE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const NOW_DOT_CLASS =
  "inline-flex items-center gap-1.5 before:size-1.5 before:rounded-full before:bg-current";

/**
 * `relative_date`: a date as the distance to now, with an "active now"
 * window, an amber "soon", a dimmed past and an optional "· by" author.
 */
export function renderRelativeDate(
  value: CellValue,
  locale: string,
  options: CellOptions,
  row: Row,
) {
  const { processI18n } = getAppTranslation();
  const opts: RelativeDateOptions = options ?? {};
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The string assertion does not validate the input; Date retains its existing native coercion and exceptions for plugin values.
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);

  const now = serverRenderNow() ?? Date.now();
  const deltaMs = date.getTime() - now;
  const isPast = deltaMs < 0;
  const title = formatDate(date, locale, RELATIVE_TITLE_FORMAT) ?? undefined;

  if (opts.nowWithinMs && isPast && -deltaMs < opts.nowWithinMs) {
    return h(
      "span",
      { class: [CELL_TEXT_CLASS, NOW_DOT_CLASS, toneClass("success")], title },
      processI18n(opts.nowLabel ?? "$dms.table.cell.now"),
    );
  }

  const style = (isPast ? opts.pastStyle : undefined) ?? opts.style;
  let text =
    style === "day"
      ? formatDayMonth(date, locale, now)
      : formatRelativeDate(date, locale, now);
  const isSoon = !isPast && !!opts.soonWithinMs && deltaMs < opts.soonWithinMs;
  const tone = isPast
    ? (opts.pastTone ?? opts.tone)
    : isSoon
      ? (opts.soonTone ?? "warning")
      : opts.tone;

  const author = firstNameOf(readRowField(row, opts.byField));
  if (author) {
    text = processI18n(opts.byLabel ?? "$dms.table.cell.by", {
      date: text,
      name: author,
    });
  }
  return h("span", { class: [CELL_TEXT_CLASS, toneClass(tone)], title }, text);
}

export function renderMissingDate(options: CellOptions) {
  const { processI18n } = getAppTranslation();
  const opts: RelativeDateOptions = options ?? {};
  if (!opts.emptyLabel) return "-";
  return h(
    "span",
    { class: [CELL_TEXT_CLASS, toneClass(opts.emptyTone, "dimmed")] },
    processI18n(opts.emptyLabel),
  );
}
