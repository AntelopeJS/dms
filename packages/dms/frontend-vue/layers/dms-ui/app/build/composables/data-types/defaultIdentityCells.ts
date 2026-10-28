import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import {
  isSet,
  readRowField,
  readSubline,
  type Row,
  stringOf,
  toneClass,
} from "./cellHelpers";
import { getAppComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import StatusPill, {
  type StatusPillVariant,
} from "../../../components/status-pill/StatusPill.vue";
import { isDmsTone } from "../../utils/tone";
import IdentityCell from "../../components/table-view/IdentityCell.vue";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

const DEFAULT_RELATION_LABEL_KEY = "name";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

interface IdentityBadgeOption {
  /** Row field the badge reads. */
  field: string;
  /** Shown when the field equals this (defaults to `true`). */
  equals?: unknown;
  /** Shown when the field differs from this. */
  notEquals?: unknown;
  label: string;
  tone?: string;
}

interface IdentityOptions {
  avatarField?: string;
  icon?: string;
  /** Row field holding the tile's icon; `icon` when it is empty. */
  iconField?: string;
  subtitleField?: string;
  subtitleTone?: string;
  selfField?: string;
  selfLabel?: string;
  badges?: IdentityBadgeOption[];
  storage?: string;
  /** Name drawn, muted, for a row without a value. */
  emptyLabel?: string;
  /** Icon tile of a row without a value. */
  emptyIcon?: string;
}

const matchesBadge = (badge: IdentityBadgeOption, value: CellValue): boolean =>
  "notEquals" in badge
    ? value !== badge.notEquals
    : value === (badge.equals ?? true);

/**
 * `identity`: avatar or icon tile, the value as the name, a "You" tag on the
 * signed-in user's row, badges and a secondary line (an address as written,
 * or a composed text in its tone), all read off the row; `emptyLabel` and
 * `emptyIcon` stand for a row without a value.
 */
export function renderIdentity(
  value: CellValue,
  options: CellOptions,
  row: Row,
) {
  const { processI18n } = getAppTranslation();
  const { processText } = getAppComposedText();
  const opts: IdentityOptions = options ?? {};
  const badges = (opts.badges ?? [])
    .filter((badge) => matchesBadge(badge, readRowField(row, badge.field)))
    .map((badge) => ({ label: processI18n(badge.label), color: badge.tone }));

  const subtitle = readSubline(readRowField(row, opts.subtitleField), {
    processText,
    isStringTranslated: false,
  });
  return h(IdentityCell, {
    title: stringOf(value) ?? "",
    subtitle: subtitle?.text ?? "",
    subtitleClass: toneClass(subtitle?.tone ?? opts.subtitleTone, "dimmed"),
    emptyLabel: opts.emptyLabel ? processI18n(opts.emptyLabel) : undefined,
    emptyIcon: opts.emptyIcon,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The row's avatar field has no runtime schema; this existing component handoff remains unchecked.
    avatar: readRowField(row, opts.avatarField) as
      | { key: string }
      | string
      | null,
    icon: stringOf(readRowField(row, opts.iconField)) ?? opts.icon,
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
 * A pill the server styles per row. Mirror of `DefaultDisplays.PillItem` from
 * `@antelopejs/interface-dms/base/table-view`.
 */
interface PillItem {
  label: string;
  tone?: string;
  variant?: string;
}

const DEFAULT_PILL_VARIANT: StatusPillVariant = "soft";

const pillVariantOf = (variant: string | undefined): StatusPillVariant =>
  variant === "soft" || variant === "outline" ? variant : DEFAULT_PILL_VARIANT;

const DEFAULT_PILL_TONE = "neutral";

const isPillItem = (item: unknown, labelKey: string): item is PillItem =>
  isObject(item) && isString(item.label) && !(labelKey in item);

/**
 * The pills of a list. A bare id is skipped next to the related rows it
 * could not be resolved into; next to pill items it is a pill.
 */
function pillsOf(
  items: unknown[],
  labelKey: string,
  processI18n: (text: string) => string,
): PillItem[] {
  const hasRelatedRows = items.some(
    (item) => isObject(item) && !isPillItem(item, labelKey),
  );
  return items.flatMap((item): PillItem[] => {
    if (isPillItem(item, labelKey)) {
      return [{ ...item, label: processI18n(item.label) }];
    }
    if (isObject(item)) {
      const label = item[labelKey];
      return label === undefined ? [] : [{ label: processI18n(String(label)) }];
    }
    return hasRelatedRows ? [] : [{ label: processI18n(String(item)) }];
  });
}

/** A plain pill in the role-pill outline, a styled one as a status pill. */
function renderPill(pill: PillItem) {
  if (!pill.tone && !pill.variant) {
    return h(
      "span",
      { class: [PILL_CLASS, PILL_OUTLINE_CLASS, PILL_SHRINK_CLASS] },
      [h("span", { class: "truncate" }, pill.label)],
    );
  }
  return h(StatusPill, {
    label: pill.label,
    tone: pill.tone && isDmsTone(pill.tone) ? pill.tone : DEFAULT_PILL_TONE,
    variant: pillVariantOf(pill.variant),
    dot: "none",
    class: PILL_SHRINK_CLASS,
  });
}

/**
 * `pills`: a list (relation rows, select values, strings, pill items) as v2
 * role pills, a pill item in its own tone and variant, or a single filled
 * pill when the row's `exclusive.field` is set (an owner's crown). A bare id
 * a relation could not resolve (a deleted row) is skipped.
 */
export function renderPills(value: CellValue, options: CellOptions, row: Row) {
  const { processI18n } = getAppTranslation();
  const opts: PillsOptions = options ?? {};
  if (opts.exclusive && isSet(readRowField(row, opts.exclusive.field))) {
    return h("span", { class: [PILL_CLASS, PILL_FILLED_CLASS] }, [
      opts.exclusive.icon
        ? h(UIcon, { name: opts.exclusive.icon, class: "size-3" })
        : null,
      processI18n(opts.exclusive.label),
    ]);
  }
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const pills = pillsOf(
    items,
    opts.labelKey ?? DEFAULT_RELATION_LABEL_KEY,
    processI18n,
  );
  if (pills.length === 0) {
    return opts.emptyLabel
      ? h(
          "span",
          { class: "text-dimmed text-[12.5px]" },
          processI18n(opts.emptyLabel),
        )
      : "";
  }

  return h(
    "span",
    {
      class: "flex min-w-0 gap-1 overflow-hidden",
      title: pills.map((pill) => pill.label).join(", "),
    },
    pills.map(renderPill),
  );
}
