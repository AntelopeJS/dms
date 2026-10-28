import { type VNode } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isString } from "#dms-core/app/utils/type-check";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import { isSet, toneClass } from "./cellHelpers";
import StatusPill from "../../../components/status-pill/StatusPill.vue";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

const CELL_TEXT_CLASS = "text-[12.5px]";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

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

function renderStatus(value: CellValue, options: CellOptions) {
  const { processI18n } = getAppTranslation();
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter erases options; status labels and colors remain unchecked rather than rejecting malformed plugin inputs.
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
  const { processI18n } = getAppTranslation();
  const label = processI18n(item.label);
  if (!item.icon && !item.iconColor && !item.textColor) return label;

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

function renderSelect(value: CellValue, options?: CellOptions) {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The formatter contract erases select options; items are consumed without a runtime schema.
  const opts = options as SelectOptions | undefined;
  const formatOne = (val: CellValue) => {
    const item = opts?.items?.find((opt) => opt.value === val);
    return item ? renderSelectItem(item) : val;
  };

  if (!Array.isArray(value)) return formatOne(value);

  const rendered = value.map(formatOne);
  if (rendered.every((part) => isString(part))) {
    return rendered.join(", ");
  }
  const children: (VNode | string)[] = [];
  rendered.forEach((part, index) => {
    if (index > 0) children.push(", ");
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- An unmatched select value is still unknown; Vue receives the original unchecked child as before.
    children.push(part as VNode | string);
  });
  return h("span", { class: "inline-flex items-center gap-1" }, children);
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
export function renderIndicator(value: CellValue, options: CellOptions) {
  const { processI18n } = getAppTranslation();
  const opts: IndicatorOptions = options ?? {};
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

export const registerStatusType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "status",
    formatter: {
      default: (value, _locale, options) => renderStatus(value, options),
    },
  });
};

export const registerSelectType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "select",
    formatter: {
      default: (value, _locale, options) => renderSelect(value, options),
    },
  });
};
