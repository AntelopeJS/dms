import { defineAsyncComponent, h } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
import StatusPill from "../../../components/status-pill/StatusPill.vue";
import MonoCell from "../../components/table/MonoCell.vue";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import { readRowField, readSubline, toneClass, type Row } from "./cellHelpers";

const Sparkline = defineAsyncComponent(
  () => import("../../../components/chart/internal/Sparkline.vue"),
);

const CELL_TEXT_CLASS = "text-[12.5px]";
const FIGURE_CLASS = "font-mono text-xs tabular-nums";
const EMPTY = "—";

interface SelectItemOption {
  value: unknown;
  label?: string;
  icon?: string;
}

interface StatusPillOptions {
  tones?: Record<string, string>;
  subField?: string;
  /** Tone of the line under the pill when the row gives none. */
  subTone?: string;
  liveValues?: string[];
  /** The column's own type options: a select's items name the pill. */
  typeOptions?: { items?: SelectItemOption[] };
}

/**
 * `status_pill`: a tinted pill led by a dot, in the tone the value maps to,
 * with an optional line under it (a failure's cause, a composed "retry Oct
 * 10") in the row's tone, else `subTone`, else the pill's.
 */
function renderStatusPill(value: unknown, options: unknown, row: Row) {
  const { processI18n } = useTranslation();
  const { processText } = useComposedText();
  const opts = (options ?? {}) as StatusPillOptions;
  const key = String(value);
  const item = opts.typeOptions?.items?.find(
    (candidate) => String(candidate.value) === key,
  );
  const tone = opts.tones?.[key] ?? "neutral";
  const pill = h(StatusPill, {
    tone,
    label: processI18n(item?.label ?? key),
    icon: item?.icon,
    dot: opts.liveValues?.includes(key) ? "live" : "static",
  });
  const sub = readSubline(readRowField(row, opts.subField), {
    processText,
    isStringTranslated: true,
  });
  if (!sub) return pill;
  return h("span", { class: "flex min-w-0 flex-col items-start gap-0.5" }, [
    pill,
    h(
      "span",
      {
        class: [
          "max-w-full truncate text-xs",
          toneClass(sub.tone ?? opts.subTone ?? tone, "muted"),
        ],
        title: sub.text,
      },
      sub.text,
    ),
  ]);
}

interface ProgressOptions {
  doneField: string;
  totalField: string;
  errorField?: string;
}

const PERCENT = 100;

const numberOf = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** The shares of the bar the done and the failed items fill, in percent. */
export function progressShares(
  done: number,
  failed: number,
  total: number,
): { done: number; failed: number } {
  if (total <= 0) return { done: 0, failed: 0 };
  const clamp = (share: number) => Math.min(Math.max(share, 0), PERCENT);
  const failedShare = clamp((failed / total) * PERCENT);
  return {
    done: clamp((done / total) * PERCENT - failedShare),
    failed: failedShare,
  };
}

/**
 * `progress`: a bar filled with the items done, the failed ones in red at its
 * end, and "done / total"; green once every item is done.
 */
function renderProgress(options: unknown, row: Row) {
  const opts = (options ?? {}) as ProgressOptions;
  const done = numberOf(readRowField(row, opts.doneField));
  const total = numberOf(readRowField(row, opts.totalField));
  const failed = numberOf(readRowField(row, opts.errorField));
  const shares = progressShares(done, failed, total);
  const isComplete = total > 0 && done >= total && failed === 0;
  return h("span", { class: "flex w-full min-w-0 items-center gap-3" }, [
    h(
      "span",
      {
        class:
          "flex h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-elevated",
        role: "progressbar",
        "aria-valuemin": 0,
        "aria-valuemax": total,
        "aria-valuenow": done,
      },
      [
        h("span", {
          class: isComplete ? "bg-success" : "bg-(--dms-accent-fill)",
          style: { width: `${shares.done}%` },
        }),
        h("span", { class: "bg-error", style: { width: `${shares.failed}%` } }),
      ],
    ),
    h(
      "span",
      { class: [FIGURE_CLASS, "shrink-0 text-toned"] },
      `${done} / ${total}`,
    ),
  ]);
}

interface SparklineOptions {
  field: string;
  tone?: string;
}

/** `sparkline`: a small line chart of a list of numbers. */
function renderSparkline(options: unknown, row: Row) {
  const opts = (options ?? {}) as SparklineOptions;
  const series = readRowField(row, opts.field);
  const values = Array.isArray(series)
    ? series.map(Number).filter(Number.isFinite)
    : [];
  if (values.length < 2) return h("span", { class: "text-dimmed" }, EMPTY);
  return h("span", { class: "block h-6 w-24" }, [
    h(Sparkline, {
      values,
      accent: opts.tone ?? "primary",
      area: "none",
      showDot: false,
    }),
  ]);
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
const DURATION_UNIT_MS: Record<string, number> = { ms: 1, s: MS_PER_SECOND };

// SI symbols read the same in every language; the figure follows the locale.
const withSymbol = (
  locale: string,
  value: number,
  symbol: string,
  maximumFractionDigits = 0,
): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)} ${symbol}`;

/**
 * A duration in its most readable unit: "910 ms", "1.8 s", "4 min 12 s",
 * "2 h 5 min".
 */
export function formatDuration(ms: number, locale: string): string {
  const absolute = Math.abs(ms);
  if (absolute < MS_PER_SECOND) return withSymbol(locale, Math.round(ms), "ms");
  if (absolute < MS_PER_MINUTE) {
    return withSymbol(locale, ms / MS_PER_SECOND, "s", 1);
  }
  const [major, majorSymbol, minor, minorSymbol] =
    absolute < MS_PER_HOUR
      ? ([MS_PER_MINUTE, "min", MS_PER_SECOND, "s"] as const)
      : ([MS_PER_HOUR, "h", MS_PER_MINUTE, "min"] as const);
  const whole = Math.trunc(ms / major);
  const rest = Math.round((ms - whole * major) / minor);
  const head = withSymbol(locale, whole, majorSymbol);
  return rest === 0 ? head : `${head} ${withSymbol(locale, rest, minorSymbol)}`;
}

const BYTE_SYMBOLS = ["B", "kB", "MB", "GB", "TB"];
const BYTE_STEP = 1000;

/** A size in bytes in its most readable unit: "12 kB", "1.4 MB". */
export function formatBytes(bytes: number, locale: string): string {
  let size = bytes;
  let unitIndex = 0;
  while (Math.abs(size) >= BYTE_STEP && unitIndex < BYTE_SYMBOLS.length - 1) {
    size /= BYTE_STEP;
    unitIndex += 1;
  }
  return withSymbol(
    locale,
    size,
    BYTE_SYMBOLS[unitIndex]!,
    unitIndex === 0 ? 0 : 1,
  );
}

const figure = (text: string) =>
  h("span", { class: [FIGURE_CLASS, "block text-right text-toned"] }, text);

/**
 * Cell data types a column picks through its `display` option to draw a
 * metric: a status, a progress, a series, a duration, a size, an id.
 */
export const registerMetricCellTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "status_pill",
    formatter: {
      default: (value, _locale, options, row) =>
        renderStatusPill(value, options, row),
    },
  });
  registerDataType({
    id: "progress",
    formatter: {
      default: (_value, _locale, options, row) => renderProgress(options, row),
      empty: (_value, _locale, options, row) => renderProgress(options, row),
    },
  });
  registerDataType({
    id: "sparkline",
    formatter: {
      default: (_value, _locale, options, row) => renderSparkline(options, row),
      empty: (_value, _locale, options, row) => renderSparkline(options, row),
    },
  });
  registerDataType({
    id: "duration",
    formatter: {
      default: (value, locale, options) => {
        const unit = (options as { unit?: string } | undefined)?.unit ?? "ms";
        return figure(
          formatDuration(
            numberOf(value) * (DURATION_UNIT_MS[unit] ?? 1),
            locale,
          ),
        );
      },
    },
  });
  registerDataType({
    id: "bytes",
    formatter: {
      default: (value, locale) => figure(formatBytes(numberOf(value), locale)),
    },
  });
  registerDataType({
    id: "mono",
    formatter: {
      default: (value, _locale, options) =>
        h(MonoCell, {
          value: String(value),
          copy: !!(options as { copy?: boolean } | undefined)?.copy,
          class: CELL_TEXT_CLASS,
        }),
    },
  });
};
