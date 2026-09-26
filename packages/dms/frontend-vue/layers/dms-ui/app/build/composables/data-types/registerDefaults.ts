import { defineAsyncComponent, type VNode } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
import UAvatar from "@nuxt/ui/components/Avatar.vue";
import UBadge from "@nuxt/ui/components/Badge.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import ULink from "@nuxt/ui/components/Link.vue";
import { buildRelationBadges } from "./relationBadges";

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
  "flex items-center gap-1 truncate text-[15px] font-medium text-primary hover:text-primary/80";
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

function renderStatus(value: unknown, options: unknown) {
  const { processI18n } = useTranslation();
  const opts = options as StatusOptions | undefined;
  const isOnline = Boolean(value);
  const onlineLabel = opts?.onlineLabel || "$common.status.online";
  const offlineLabel = opts?.offlineLabel || "$common.status.offline";
  const onlineColor = opts?.onlineColor || "primary";
  const offlineColor = opts?.offlineColor || "neutral";

  return h("div", { class: "flex items-center gap-2" }, [
    h("div", {
      class: `w-2 h-2 rounded-full shrink-0`,
      style: {
        backgroundColor: isOnline
          ? `var(--ui-color-${onlineColor}-500)`
          : `var(--ui-color-${offlineColor}-400)`,
      },
    }),
    h(
      "span",
      { class: "text-sm" },
      isOnline ? processI18n(onlineLabel) : processI18n(offlineLabel),
    ),
  ]);
}

function renderSelectItem(item: SelectItem) {
  const { processI18n } = useTranslation();
  const label = processI18n(item.label);
  if (!item.icon && !item.iconColor && !item.textColor) return label;

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

const registerDateType = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "date",
    formatter: {
      default: (value: unknown, locale: string) => {
        const { t } = useI18n();
        return formatDate(value, locale) ?? t("dms.date.undefined");
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
}
