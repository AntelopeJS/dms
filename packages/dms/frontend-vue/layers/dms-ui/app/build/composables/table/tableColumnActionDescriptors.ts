import type { Data } from "../../components/table/Table.vue";
import { isObject, isNumber } from "#dms-core/app/utils/type-check";
import type { DropdownMenuItem } from "@nuxt/ui/components/DropdownMenu.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { createMenuItem } from "./utils/menuItemFactory";
import {
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "../table-view/types";
import { fillFormPageUrl } from "../table-view/useTableViewConfig";
import { resolveConfirmText } from "../confirm/confirmDialogTexts";

import type {
  TableColumnContext,
  RowActionDescriptor,
} from "./tableColumnTypes";

export const BUILTIN_ROW_ACTION_KEYS = [
  "copyLink",
  "details",
  "edit",
  "duplicate",
  "delete",
  "archive",
  "restore",
] as const;

const DESTRUCTIVE_ROW_ACTION_KEYS = new Set(["delete", "archive", "restore"]);

export const isShowingArchived = <T extends Data>(
  context: TableColumnContext<T>,
) => {
  const { config } = context;
  return config.showArchived?.value === true;
};

export const isCustomActionInline = (action: CustomRowAction): boolean => {
  return action.isVisible === true;
};

const normalizedConfigOf = <T extends Data>(
  context: TableColumnContext<T>,
  key: (typeof BUILTIN_ROW_ACTION_KEYS)[number],
): RowActionConfig | undefined => {
  const { config } = context;

  const actionConfig = config.rowActions?.[key];
  return isObject(actionConfig) ? actionConfig : undefined;
};

export const isOffMode = <T extends Data>(
  context: TableColumnContext<T>,
  descriptor: RowActionDescriptor,
): boolean => {
  const { config } = context;

  if (!config.showArchived) return false;
  return isShowingArchived(context)
    ? descriptor.key === "archive"
    : descriptor.key === "restore";
};

const isActionDisabled = <T extends Data>(
  context: TableColumnContext<T>,
  actionConfig: boolean | RowActionConfig | undefined,
  rowData: T,
): boolean => {
  const { config } = context;

  const actionConfigNormalized = normalizeActionConfig(actionConfig);
  if (!actionConfigNormalized.isEnabled) return true;
  if (!actionConfigNormalized.rule) return false;

  const validator = createActionValidator(
    actionConfigNormalized,
    config.data.value,
    config.rowIdKey,
  );
  return !validator.canPerformAction(get(rowData, config.rowIdKey));
};

const rowText = <T extends Data>(
  context: TableColumnContext<T>,
  text: string,
  rowData: T,
): string => {
  const { t } = context;
  return resolveConfirmText(text, rowData, t);
};

export const menuLabel = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
): string => {
  const { config, t } = context;

  const declared = config.rowActions?.menuLabel;
  if (declared) return rowText(context, declared, rowData);
  const label = config.labelKey ? get(rowData, config.labelKey) : undefined;
  return isString(label) || isNumber(label)
    ? t("dms.table.row_actions_for", { label })
    : t("dms.table.row_actions");
};

const isCustomActionDisabled = <T extends Data>(
  context: TableColumnContext<T>,
  action: CustomRowAction,
  rowData: T,
): boolean => {
  const { config } = context;

  if (!action.rule) return false;

  const validator = createActionValidator(
    { isEnabled: true, rule: action.rule },
    config.data.value,
    config.rowIdKey,
  );
  return !validator.canPerformAction(get(rowData, config.rowIdKey));
};

const buildCopyLinkOnSelect = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
) => {
  const { config, t, router, toast, copyToClipboard } = context;
  return async () => {
    let itemUrl: string;
    const currentRoute = router.currentRoute.value;

    const containerType =
      config.formContainer?.type ?? DEFAULT_FORM_CONTAINER_TYPE;
    const viewPageUrl =
      containerType === FormContainerType.page
        ? config.formPages?.view
        : undefined;
    if (viewPageUrl) {
      const itemId = get(rowData, config.rowIdKey);
      itemUrl = `${window.location.origin}${fillFormPageUrl(viewPageUrl, config.routeParams, itemId)}`;
    } else {
      const updatedQuery = {
        ...currentRoute.query,
        [`${config.componentId}:id`]: get(rowData, config.rowIdKey),
      };
      itemUrl = `${window.location.origin}${currentRoute.path}?${new URLSearchParams(updatedQuery).toString()}`;
    }

    await copyToClipboard(itemUrl);

    toast.add({
      title: t("dms.table.link_copied"),
      color: Color.success,
    });
  };
};

const copyLinkAfterConfirm = async <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
) => {
  const { config, confirmAction } = context;

  const declared = normalizedConfigOf(context, "copyLink")?.confirm;
  if (declared) {
    const isConfirmed = await confirmAction(declared, {
      row: rowData,
      urlParams: { id: get(rowData, config.rowIdKey) },
    });
    if (!isConfirmed) return;
  }
  await buildCopyLinkOnSelect(context, rowData)();
};

const buildCustomActionDescriptors = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
): RowActionDescriptor[] => {
  const { config } = context;
  return (config.rowActions?.custom || []).map((action) => ({
    label: rowText(context, action.label, rowData),

    icon: action.icon || (action.showLabel ? "" : "i-ph-lightning"),
    onSelect: () => config.onCustomRowAction?.(action, rowData),
    disabled: isCustomActionDisabled(context, action, rowData),
    visible: isCustomActionInline(action),
    color: action.color,
    variant: action.variant,
    showLabel: action.showLabel,
  }));
};

const builtInLabel = <T extends Data>(
  context: TableColumnContext<T>,
  key: (typeof BUILTIN_ROW_ACTION_KEYS)[number],
  fallback: string,
): string => {
  const { processI18n } = context;

  const label = normalizedConfigOf(context, key)?.label;
  return label ? processI18n(label) : fallback;
};

const builtInIcon = <T extends Data>(
  context: TableColumnContext<T>,
  key: (typeof BUILTIN_ROW_ACTION_KEYS)[number],
  fallback: string,
): string => {
  return normalizedConfigOf(context, key)?.icon ?? fallback;
};

const buildBuiltInActionDescriptors = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
): RowActionDescriptor[] => {
  const { config, t } = context;
  return [
    {
      key: "copyLink",
      label: builtInLabel(context, "copyLink", t("dms.button.copy_link")),
      icon: builtInIcon(context, "copyLink", "i-ph-link"),
      onSelect: () => copyLinkAfterConfirm(context, rowData),
      disabled: isActionDisabled(context, config.rowActions?.copyLink, rowData),
      visible: isActionVisible(config.rowActions?.copyLink),
    },
    {
      key: "details",
      label: builtInLabel(context, "details", t("dms.button.details")),
      icon: builtInIcon(context, "details", "i-ph-info"),
      onSelect: () => config.emits("details", rowData),
      disabled: isActionDisabled(context, config.rowActions?.details, rowData),
      visible: isActionVisible(config.rowActions?.details),
    },
    {
      key: "edit",
      label: builtInLabel(context, "edit", t("dms.button.edit")),
      icon: builtInIcon(context, "edit", "i-ph-pencil"),
      onSelect: () => config.emits("edit", rowData),
      disabled: isActionDisabled(context, config.rowActions?.edit, rowData),
      visible: isActionVisible(config.rowActions?.edit),
    },
    {
      key: "duplicate",
      label: builtInLabel(context, "duplicate", t("dms.button.duplicate")),
      icon: builtInIcon(context, "duplicate", "i-ph-copy"),
      onSelect: () => config.emits("duplicate", get(rowData, config.rowIdKey)),
      disabled: isActionDisabled(
        context,
        config.rowActions?.duplicate,
        rowData,
      ),
      visible: isActionVisible(config.rowActions?.duplicate),
    },
    {
      key: "delete",
      label: builtInLabel(context, "delete", t("dms.button.delete")),
      icon: builtInIcon(context, "delete", "i-ph-trash"),
      onSelect: () => config.emits("delete", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(context, config.rowActions?.delete, rowData),
      visible: isActionVisible(config.rowActions?.delete),
      color: Color.error,
    },
    {
      key: "archive",
      label: builtInLabel(context, "archive", t("dms.button.archive")),
      icon: builtInIcon(context, "archive", "i-ph-archive"),
      onSelect: () => config.emits("archive", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(context, config.rowActions?.archive, rowData),
      visible: isActionVisible(config.rowActions?.archive),
    },
    {
      key: "restore",
      label: builtInLabel(context, "restore", t("dms.button.restore")),
      icon: builtInIcon(context, "restore", "i-ph-arrow-counter-clockwise"),
      onSelect: () => config.emits("restore", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(context, config.rowActions?.restore, rowData),
      visible: isActionVisible(config.rowActions?.restore),
    },
  ];
};

export const buildRowActionDescriptors = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T,
): RowActionDescriptor[] => {
  const builtIns = buildBuiltInActionDescriptors(context, rowData);
  return [
    ...builtIns.filter((d) => !isDestructive(d)),
    ...buildCustomActionDescriptors(context, rowData),
    ...builtIns.filter(isDestructive),
  ];
};

export const isDestructive = (descriptor: RowActionDescriptor): boolean => {
  return !!descriptor.key && DESTRUCTIVE_ROW_ACTION_KEYS.has(descriptor.key);
};

export const descriptorToMenuItem = (
  descriptor: RowActionDescriptor,
): DropdownMenuItem => {
  return createMenuItem(
    descriptor.label,
    descriptor.icon,
    descriptor.onSelect,
    descriptor.color ? { color: descriptor.color } : undefined,
  );
};
