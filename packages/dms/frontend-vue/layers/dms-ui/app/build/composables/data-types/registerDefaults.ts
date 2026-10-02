import { defineAsyncComponent, type VNode } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
import UAvatar from "@nuxt/ui/components/Avatar.vue";
import UBadge from "@nuxt/ui/components/Badge.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import ULink from "@nuxt/ui/components/Link.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { buildRelationBadges } from "./relationBadges";
import StatusPill from "../../../components/status-pill/StatusPill.vue";
import IdentityCell from "../../../components/table-view/IdentityCell.vue";
import {
  firstNameOf,
  formatDayMonth,
  formatRelativeDate,
} from "../../../utils/relativeDate";

const FilePreview = defineAsyncComponent(
  () => import("../../../components/table-view/FilePreview.vue"),
);

const ImagePreview = defineAsyncComponent(
  () => import("../../../components/table-view/ImagePreview.vue"),
);

const CascaderPath = defineAsyncComponent(
  () => import("../../../components/table-view/CascaderPath.vue"),
);

const DisplayRichText = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayRichText.vue"),
);
const DisplayPassword = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayPassword.vue"),
);
const DisplayFile = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayFile.vue"),
);
const DisplayImage = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayImage.vue"),
);
const DisplayColor = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayColor.vue"),
);

const LINK_CLASS =
  "flex items-center gap-1 truncate text-[13px] font-medium text-primary hover:text-primary/80";
const LINK_ICON_CLASS = "size-3 text-primary/70 flex-shrink-0";
const LINK_ICON_NAME = "i-ph-arrow-up-right-light";
const DEFAULT_RELATION_VALUE_KEY = "_id";
const DEFAULT_RELATION_LABEL_KEY = "name";
const RELATION_BADGES_CLASS = "inline-flex flex-wrap items-center gap-1";
const RELATION_BADGE_CLASS = "max-w-40";
const PERMISSION_SEPARATOR = ".";

interface LinkRendererOptions {
  hrefPrefix?: string;
  target?: string;
}

interface SelectItem {
  value: unknown;
  label: string;
  icon?: string;
  iconColor?: string;
  textColor?: string;
}

interface SelectOptions {
  items?: SelectItem[];
}

interface StatusOptions {
  onlineLabel?: string;
  offlineLabel?: string;
  onlineColor?: string;
  offlineColor?: string;
}

interface RelationOptions {
  multiple?: boolean;
  keyMapping?: { label?: string; avatar?: string; value?: string };
}

interface CascaderRelationOptions {
  multiple?: boolean;
  searchUrl?: string;
  keyMapping?: {
    label?: string;
    value?: string;
    parent?: string;
    disabled?: string;
  };
}

interface FileOptions {
  multiple?: boolean;
  storage?: string;
}

interface ImageOptions {
  multiple?: boolean;
  storage?: string;
}

interface TreeOptions {
  multiple?: boolean;
}

function createLinkRenderer(options: LinkRendererOptions) {
  return (value: unknown, _locale: string) => {
    if (!value || !isString(value)) return String(value);

    const href = options.hrefPrefix
      ? `${options.hrefPrefix}${value}`
      : (value as string);

    return h(
      ULink,
      {
        to: href,
        title: value as string,
        ...(options.target && { target: options.target }),
        class: LINK_CLASS,
        onClick: (event: Event) => event.stopPropagation(),
      },
      () => [
        h("span", { class: "truncate" }, value as string),
        h(UIcon, { name: LINK_ICON_NAME, class: LINK_ICON_CLASS }),
      ],
    );
  };
}

const convertToBoolean = (value: unknown): boolean =>
  parse(String(value)) === true;

const getBooleanLabel = (value: unknown): string => {
  const { processI18n } = useTranslation();
  return convertToBoolean(value)
    ? processI18n("$dms.table.filter.boolean.checked")
    : processI18n("$dms.table.filter.boolean.unchecked");
};

function renderBoolean(value: unknown) {
  const boolValue = convertToBoolean(value);
  return h("div", { class: "flex items-center gap-1" }, [
    h(UIcon, { name: boolValue ? "i-ph-check-circle" : "i-ph-x-circle" }),
    h("span", getBooleanLabel(value)),
  ]);
}

function formatDateBetween(value: unknown, locale: string): string {
  const { t } = useI18n();
  const [rawStart, rawEnd] = Array.isArray(value)
    ? value
    : [
        (value as { start?: unknown })?.start,
        (value as { end?: unknown })?.end,
      ];
  const start = formatDate(rawStart, locale) ?? t("dms.date.undefined");
  const end = formatDate(rawEnd, locale) ?? t("dms.date.undefined");
  return `${start} - ${end}`;
}

// v2 .status pill, tinted with the configured online/offline color.
function renderStatus(value: unknown, options: unknown) {
  const { processI18n } = useTranslation();
  const opts = options as StatusOptions | undefined;
  const isOnline = Boolean(value);
  const onlineLabel = opts?.onlineLabel || "$common.status.online";
  const offlineLabel = opts?.offlineLabel || "$common.status.offline";
  const onlineColor = opts?.onlineColor || "primary";
  const offlineColor = opts?.offlineColor || "neutral";

  return h(StatusPill, {
    tone: isOnline ? onlineColor : offlineColor,
    label: isOnline ? processI18n(onlineLabel) : processI18n(offlineLabel),
  });
}

/** v2 status pill: mono label on a tint of its color, led by a dot. */
function renderStatusPill(label: string, color: string) {
  return h(StatusPill, { tone: color, label });
}

function renderSelectItem(item: SelectItem) {
  const { processI18n } = useTranslation();
  const label = processI18n(item.label);
  if (!item.icon && !item.iconColor && !item.textColor) return label;

  // A colored option is a status: v2 renders it as a pill, without the icon.
  const statusColor = item.textColor ?? item.iconColor;
  if (statusColor) return renderStatusPill(label, statusColor);

  const children: VNode[] = [];
  if (item.icon) {
    children.push(
      h(UIcon, {
        name: item.icon,
        class: "size-4 shrink-0",
        style: item.iconColor
          ? { color: `var(--ui-${item.iconColor})` }
          : undefined,
      }),
    );
  }
  children.push(
    h(
      "span",
      {
        style: item.textColor
          ? { color: `var(--ui-${item.textColor})` }
          : undefined,
      },
      label,
    ),
  );

  return h("span", { class: "inline-flex items-center gap-1.5" }, children);
}

function renderSelect(value: unknown, options?: unknown) {
  const opts = options as SelectOptions | undefined;
  const formatOne = (val: unknown) => {
    const item = opts?.items?.find((opt) => opt.value === val);
    return item ? renderSelectItem(item) : val;
  };

  if (!Array.isArray(value)) return formatOne(value);

  const rendered = value.map(formatOne);
  if (rendered.every((part) => typeof part === "string")) {
    return rendered.join(", ");
  }
  const children: (VNode | string)[] = [];
  rendered.forEach((part, index) => {
    if (index > 0) children.push(", ");
    children.push(part as VNode | string);
  });
  return h("span", { class: "inline-flex items-center gap-1" }, children);
}

function formatAddress(value: unknown): string {
  if (!value || typeof value !== "object") return " ";

  const { processI18n } = useTranslation();
  const addr = value as Record<string, string>;
  const countryName = addr.countryCode
    ? processI18n(`$country.${addr.countryCode}`)
    : addr.countryCode;
  const number = [addr.houseNumber, addr.boxNumber].filter(Boolean).join("/");
  const street = [addr.streetName, number].filter(Boolean).join(" ");
  const parts = [
    street,
    addr.addressLine2,
    addr.postalCode,
    addr.city,
    addr.countrySubdivision,
    countryName,
  ].filter(Boolean);
  return parts.join(", ");
}

function countLeafPermissions(value: string[]): number {
  const parentIds = new Set<string>();
  for (const id of value) {
    const parts = id.split(PERMISSION_SEPARATOR);
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i] ?? "";
      prefix = i === 0 ? segment : `${prefix}${PERMISSION_SEPARATOR}${segment}`;
      parentIds.add(prefix);
    }
  }
  return value.filter((id) => !parentIds.has(id)).length;
}

function renderRelationBadge(label: string, title?: string) {
  return h(UBadge, {
    label,
    title: title ?? label,
    color: "neutral",
    variant: "subtle",
    size: Size.small,
    class: RELATION_BADGE_CLASS,
  });
}

function renderRelationBadges(values: unknown[], labelKey: string) {
  const { processI18n } = useTranslation();
  const { visible, hidden } = buildRelationBadges(values, labelKey);
  const badges = visible.map((label) =>
    renderRelationBadge(processI18n(label)),
  );
  if (hidden.length > 0) {
    const hiddenLabels = hidden.map((label) => processI18n(label)).join(", ");
    badges.push(renderRelationBadge(`+${hidden.length}`, hiddenLabels));
  }
  return h("span", { class: RELATION_BADGES_CLASS }, badges);
}

function renderRelation(value: unknown, options: unknown) {
  const opts = options as RelationOptions | undefined;
  const labelKey = opts?.keyMapping?.label || DEFAULT_RELATION_LABEL_KEY;

  if (opts?.multiple && Array.isArray(value)) {
    return renderRelationBadges(value, labelKey);
  }

  if (!value || !isObject(value)) return value;

  const valueObject = value as Record<string, string>;
  const avatarKey = opts?.keyMapping?.avatar;
  const label = valueObject[labelKey] || String(value);

  if (!avatarKey || !valueObject[avatarKey]) return label;

  return h("span", { class: "inline-flex items-center gap-2" }, [
    h(UAvatar, {
      src: valueObject[avatarKey],
      alt: String(label),
      size: Size.tiny,
    }),
    h("span", String(label)),
  ]);
}

function renderCascaderRelation(value: unknown, options: unknown) {
  const { t } = useI18n();
  const opts = options as CascaderRelationOptions | undefined;

  if (opts?.multiple && Array.isArray(value)) {
    return t("dms.form.cascader.selected_count", { count: value.length });
  }

  if (!value) return value;

  return h(CascaderPath, {
    value,
    searchUrl: opts?.searchUrl,
    keyMapping: opts?.keyMapping,
  });
}

function mapRelationBeforeState(value: unknown, options: unknown) {
  if (!value) return value;

  const opts = options as RelationOptions | undefined;
  const valueKey = opts?.keyMapping?.value || DEFAULT_RELATION_VALUE_KEY;

  if (typeof value === "string" || typeof value === "number") return value;

  if (opts?.multiple && Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)[valueKey]
        : item,
    );
  }

  if (typeof value === "object" && value !== null) {
    return (value as Record<string, unknown>)[valueKey];
  }

  return value;
}

function toImageList(value: unknown): ImageItemValue[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (item): item is ImageItemValue => isObject(item) && isString(item.key),
  );
}

function renderImage(value: unknown, options: unknown) {
  if (isString(value)) {
    return h(UAvatar, { src: value, alt: value });
  }

  const images = toImageList(value);
  if (!images.length) return "";

  const opts = options as ImageOptions | undefined;
  return h(ImagePreview, { images, storage: opts?.storage });
}

function renderFile(value: unknown, options: unknown) {
  const { t } = useI18n();
  const opts = options as FileOptions | undefined;

  if (opts?.multiple && Array.isArray(value)) {
    return t("dms.form.file.count", { count: value.length });
  }

  if (isString(value)) {
    return h(FilePreview, { resourceKey: value, storage: opts?.storage });
  }

  return "";
}

type Row = Record<string, unknown> | undefined;

const readRowField = (row: Row, field: string | undefined): unknown =>
  field && row ? get(row, field) : undefined;

const stringOf = (value: unknown): string | undefined =>
  value === null || value === undefined || value === ""
    ? undefined
    : String(value);

/** Truthy the way a status reads it: a non-empty list, a set flag. */
const isSet = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value !== "" && value !== "false";
  return Boolean(value);
};

// Text tones a cell data type can take, as literal classes for Tailwind.
const CELL_TONES: Record<string, string> = {
  default: "text-toned",
  toned: "text-toned",
  highlighted: "text-highlighted",
  muted: "text-muted",
  dimmed: "text-dimmed",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
  primary: "text-primary",
};
const toneClass = (tone: string | undefined, fallback = "default"): string =>
  CELL_TONES[tone ?? fallback] ?? CELL_TONES[fallback]!;

interface IdentityBadgeOption {
  /** Row field the badge reads. */
  field: string;
  /** Shown when the field equals this (defaults to `true`). */
  equals?: unknown;
  /** Shown when the field differs from this. */
  notEquals?: unknown;
  label: string;
  color?: string;
}

interface IdentityOptions {
  avatarField?: string;
  icon?: string;
  subtitleField?: string;
  selfField?: string;
  selfLabel?: string;
  badges?: IdentityBadgeOption[];
  storage?: string;
}

const matchesBadge = (badge: IdentityBadgeOption, value: unknown): boolean =>
  "notEquals" in badge
    ? value !== badge.notEquals
    : value === (badge.equals ?? true);

/**
 * `identity`: avatar or icon tile, the value as the name, a "You" tag on the
 * signed-in user's row, badges and a secondary line, all read off the row.
 */
function renderIdentity(value: unknown, options: unknown, row: Row) {
  const { processI18n } = useTranslation();
  const opts = (options ?? {}) as IdentityOptions;
  const badges = (opts.badges ?? [])
    .filter((badge) => matchesBadge(badge, readRowField(row, badge.field)))
    .map((badge) => ({ label: processI18n(badge.label), color: badge.color }));
  return h(IdentityCell, {
    title: stringOf(value) ?? "",
    subtitle: stringOf(readRowField(row, opts.subtitleField)) ?? "",
    avatar: readRowField(row, opts.avatarField) as
      | { key: string }
      | string
      | null,
    icon: opts.icon,
    selfId: stringOf(readRowField(row, opts.selfField)),
    selfLabel: opts.selfLabel ? processI18n(opts.selfLabel) : undefined,
    badges,
    storage: opts.storage,
  });
}

interface PillsOptions {
  /** Field naming a related row (relation values). Defaults to `name`. */
  labelKey?: string;
  /** When the row's field is set, one filled pill replaces the list. */
  exclusive?: { field: string; label: string; icon?: string };
  /** Text drawn for an empty list. */
  emptyLabel?: string;
}

const PILL_CLASS =
  "inline-flex h-[22px] items-center gap-[5px] rounded-full border px-[9px] font-mono text-[11px] whitespace-nowrap";
const PILL_OUTLINE_CLASS = "border-accented text-toned font-[550]";
const PILL_SHRINK_CLASS = "min-w-12";
const PILL_FILLED_CLASS =
  "shrink-0 border-(--dms-accent-fill) bg-(--dms-accent-fill) font-[650] text-(--dms-accent-on-fill)";

/**
 * `pills`: a list (relation rows, select values, strings) as v2 role pills,
 * or a single filled pill when the row's `exclusive.field` is set (an owner's
 * crown). A bare id a relation could not resolve (a deleted row) is skipped.
 */
function renderPills(value: unknown, options: unknown, row: Row) {
  const { processI18n } = useTranslation();
  const opts = (options ?? {}) as PillsOptions;
  if (opts.exclusive && isSet(readRowField(row, opts.exclusive.field))) {
    return h("span", { class: [PILL_CLASS, PILL_FILLED_CLASS] }, [
      opts.exclusive.icon
        ? h(UIcon, { name: opts.exclusive.icon, class: "size-3" })
        : null,
      processI18n(opts.exclusive.label),
    ]);
  }
  const labelKey = opts.labelKey ?? DEFAULT_RELATION_LABEL_KEY;
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const hasObjects = items.some((item) => isObject(item));
  const labels = items.flatMap((item) => {
    if (isObject(item)) {
      const label = (item as Record<string, unknown>)[labelKey];
      return label === undefined ? [] : [processI18n(String(label))];
    }
    return hasObjects ? [] : [processI18n(String(item))];
  });
  if (labels.length === 0) {
    return opts.emptyLabel
      ? h(
          "span",
          { class: "text-dimmed text-[12.5px]" },
          processI18n(opts.emptyLabel),
        )
      : "";
  }
  // Pills too wide for the column shrink to an ellipsis (no shorter than a
  // few letters); the list's tooltip names them all.
  return h(
    "span",
    { class: "flex min-w-0 gap-1 overflow-hidden", title: labels.join(", ") },
    labels.map((label) =>
      h(
        "span",
        { class: [PILL_CLASS, PILL_OUTLINE_CLASS, PILL_SHRINK_CLASS] },
        [h("span", { class: "truncate" }, label)],
      ),
    ),
  );
}

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

const CELL_TEXT_CLASS = "text-[12.5px]";
// Tooltip of a relative date: the exact moment, in the reader's preferences.
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
function renderRelativeDate(
  value: unknown,
  locale: string,
  options: unknown,
  row: Row,
) {
  const { processI18n } = useTranslation();
  const opts = (options ?? {}) as RelativeDateOptions;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  const deltaMs = date.getTime() - Date.now();
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
      ? formatDayMonth(date, locale)
      : formatRelativeDate(date, locale);
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

function renderMissingDate(options: unknown) {
  const { processI18n } = useTranslation();
  const opts = (options ?? {}) as RelativeDateOptions;
  if (!opts.emptyLabel) return "-";
  return h(
    "span",
    { class: [CELL_TEXT_CLASS, toneClass(opts.emptyTone, "dimmed")] },
    processI18n(opts.emptyLabel),
  );
}

interface IndicatorOptions {
  onLabel?: string;
  offLabel?: string;
  onIcon?: string;
  offIcon?: string;
  /** Defaults to `success`. */
  onTone?: string;
  /** Defaults to `dimmed`. */
  offTone?: string;
}

/**
 * `indicator`: an on/off state as an icon and a word ("On" with a shield),
 * on for a set flag or a non-empty list.
 */
function renderIndicator(value: unknown, options: unknown) {
  const { processI18n } = useTranslation();
  const opts = (options ?? {}) as IndicatorOptions;
  const isOn = isSet(value);
  const icon = isOn ? opts.onIcon : opts.offIcon;
  const label = isOn
    ? (opts.onLabel ?? "$dms.table.filter.boolean.checked")
    : (opts.offLabel ?? "$dms.table.filter.boolean.unchecked");
  return h(
    "span",
    {
      class: [
        "inline-flex items-center gap-[5px]",
        CELL_TEXT_CLASS,
        isOn
          ? toneClass(opts.onTone, "success")
          : toneClass(opts.offTone, "dimmed"),
      ],
    },
    [
      icon ? h(UIcon, { name: icon, class: "size-[15px] shrink-0" }) : null,
      processI18n(label),
    ],
  );
}

/**
 * Cell data types a column picks through its `display` option, composing the
 * row's fields: reusable by any table.
 */
const registerCellTypes = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "identity",
    formatter: {
      default: (value, _locale, options, row) =>
        renderIdentity(value, options, row),
      empty: (_value, _locale, options, row) =>
        renderIdentity("", options, row),
    },
  });
  registerDataType({
    id: "pills",
    formatter: {
      default: (value, _locale, options, row) =>
        renderPills(value, options, row),
      empty: (_value, _locale, options, row) => renderPills([], options, row),
    },
  });
  registerDataType({
    id: "relative_date",
    formatter: {
      default: (value, locale, options, row) =>
        renderRelativeDate(value, locale, options, row),
      empty: (_value, _locale, options) => renderMissingDate(options),
    },
  });
  registerDataType({
    id: "indicator",
    formatter: {
      default: (value, _locale, options) => renderIndicator(value, options),
      empty: (_value, _locale, options) => renderIndicator(false, options),
    },
  });
};

const registerPrimitiveTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "number",
    formatter: { default: formatNumber as DataTypeFormatter },
  });
  registerDataType({
    id: "string",
    formatter: { default: (value: unknown, _locale: string) => value },
  });
  registerDataType({
    id: "price",
    formatter: { default: formatPrice as DataTypeFormatter },
  });
  registerDataType({
    id: "percentage",
    formatter: { default: formatPercentage as DataTypeFormatter },
  });
  registerDataType({
    id: "string_time",
    formatter: { default: formatTimeSpan },
  });
};

// Table cells use a short month ("30 Sep 2026", order per locale) so the
// date fits a default-width column in the mono face.
const CELL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const registerDateType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "date",
    formatter: {
      default: (value: unknown, locale: string) => {
        const { t } = useI18n();
        return formatDate(value, locale) ?? t("dms.date.undefined");
      },
      cell: (value: unknown, locale: string) => {
        const { t } = useI18n();
        return (
          formatDate(value, locale, CELL_DATE_FORMAT) ?? t("dms.date.undefined")
        );
      },
      is_between: formatDateBetween,
    },
  });
};

const registerBooleanType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "boolean",
    formatter: {
      default: (value: unknown, _locale: string) => renderBoolean(value),
      is: getBooleanLabel,
      is_not: getBooleanLabel,
    },
  });
};

const registerStatusType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "status",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) =>
        renderStatus(value, options),
    },
  });
};

const registerSelectType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "select",
    formatter: {
      default: (value: unknown, _locale: string, options?: unknown) =>
        renderSelect(value, options),
    },
  });
};

const registerAddressType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "address",
    formatter: {
      default: (value: unknown, _locale: string) => formatAddress(value),
    },
  });
};

const registerImageType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "image",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) =>
        renderImage(value, options),
    },
    displayComponent: DisplayImage,
  });
};

const registerLinkTypes = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "email",
    formatter: { default: createLinkRenderer({ hrefPrefix: "mailto:" }) },
  });
  registerDataType({
    id: "url",
    formatter: { default: createLinkRenderer({ target: "_blank" }) },
  });
};

const registerTreeType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "tree",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) => {
        const { t } = useI18n();
        const opts = options as TreeOptions | undefined;
        if (opts?.multiple && Array.isArray(value)) {
          return t("dms.form.relation.selected_count", { count: value.length });
        }
        return value;
      },
    },
  });
};

const registerPermissionsType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "permissions",
    formatter: {
      default: (value: unknown, _locale: string) => {
        const { t } = useI18n();
        if (!Array.isArray(value)) return value;
        const leafCount = countLeafPermissions(value as string[]);
        return t("dms.form.relation.selected_count", { count: leafCount });
      },
    },
  });
};

const registerRelationType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "relation",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) =>
        renderRelation(value, options),
    },
    beforeStateMapper: mapRelationBeforeState,
  });
};

const registerCascaderRelationType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "cascader_relation",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) =>
        renderCascaderRelation(value, options),
    },
    beforeStateMapper: mapRelationBeforeState,
  });
};

const registerFileType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "file",
    formatter: {
      default: (value: unknown, _locale: string, options: unknown) =>
        renderFile(value, options),
    },
    displayComponent: DisplayFile,
  });
};

const registerDisplayOnlyTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({ id: "rich_text", displayComponent: DisplayRichText });
  registerDataType({ id: "password", displayComponent: DisplayPassword });
  registerDataType({
    id: "color",
    displayComponent: DisplayColor,
    formatter: {
      default: (value: unknown, _locale: string) =>
        typeof value === "string" ? value : "",
    },
  });
};

export function registerDefaultDataTypes() {
  const { registerDataType } = useDataTypes();

  registerPrimitiveTypes(registerDataType);
  registerDateType(registerDataType);
  registerBooleanType(registerDataType);
  registerStatusType(registerDataType);
  registerSelectType(registerDataType);
  registerAddressType(registerDataType);
  registerImageType(registerDataType);
  registerLinkTypes(registerDataType);
  registerTreeType(registerDataType);
  registerPermissionsType(registerDataType);
  registerRelationType(registerDataType);
  registerCascaderRelationType(registerDataType);
  registerFileType(registerDataType);
  registerDisplayOnlyTypes(registerDataType);
  registerCellTypes(registerDataType);
}
