import type { Data } from "../../components/table/TableRoot.vue";
import { isObject, isNumber } from "#dms-core/app/utils/type-check";
import type { DropdownMenuItem } from "@nuxt/ui/components/DropdownMenu.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { rowIdOf } from "./utils/rowId";
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
  rowData: Data,
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
  return !validator.canPerformAction(rowIdOf(rowData, config.rowIdKey));
};

const rowText = <T extends Data>(
  context: TableColumnContext<T>,
  text: string,
  rowData: Data,
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
  const label: unknown = config.labelKey
    ? get(rowData, config.labelKey)
    : undefined;
  return isString(label) || isNumber(label)
    ? t("dms.table.row_actions_for", { label })
    : t("dms.table.row_actions");
};

const isCustomActionDisabled = <T extends Data>(
  context: TableColumnContext<T>,
  action: CustomRowAction,
  rowData: Data,
): boolean => {
  const { config } = context;

  if (!action.rule) return false;

  const validator = createActionValidator(
    { isEnabled: true, rule: action.rule },
    config.data.value,
    config.rowIdKey,
  );
  return !validator.canPerformAction(rowIdOf(rowData, config.rowIdKey));
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
      const itemId = rowIdOf(rowData, config.rowIdKey);
      itemUrl = `${window.location.origin}${fillFormPageUrl(viewPageUrl, config.routeParams, itemId)}`;
    } else {
      const updatedQuery = {
        ...currentRoute.query,
        [`${config.componentId}:id`]: rowIdOf(rowData, config.rowIdKey),
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
      urlParams: { id: rowIdOf(rowData, config.rowIdKey) },
    });
    if (!isConfirmed) return;
  }
  await buildCopyLinkOnSelect(context, rowData)();
};

/** Runs an action on the row a descriptor stands for; a descriptor built for no row selects nothing. */
const onRow =
  <T extends Data>(rowData: T | undefined, act: (row: T) => void) =>
  (): void => {
    if (rowData !== undefined) act(rowData);
  };

const buildCustomActionDescriptors = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T | undefined,
): RowActionDescriptor[] => {
  const { config } = context;
  const shown: Data = rowData ?? {};
  return (config.rowActions?.custom || []).map((action) => ({
    label: rowText(context, action.label, shown),

    icon: action.icon || (action.showLabel ? "" : "i-ph-lightning"),
    onSelect: onRow(rowData, (row) => config.onCustomRowAction?.(action, row)),
    disabled: isCustomActionDisabled(context, action, shown),
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
  rowData: T | undefined,
): RowActionDescriptor[] => {
  const { config, t } = context;
  const shown: Data = rowData ?? {};
  return [
    {
      key: "copyLink",
      label: builtInLabel(context, "copyLink", t("dms.button.copy_link")),
      icon: builtInIcon(context, "copyLink", "i-ph-link"),
      onSelect: onRow(rowData, (row) => copyLinkAfterConfirm(context, row)),
      disabled: isActionDisabled(context, config.rowActions?.copyLink, shown),
      visible: isActionVisible(config.rowActions?.copyLink),
    },
    {
      key: "details",
      label: builtInLabel(context, "details", t("dms.button.details")),
      icon: builtInIcon(context, "details", "i-ph-info"),
      onSelect: onRow(rowData, (row) => config.emits("details", row)),
      disabled: isActionDisabled(context, config.rowActions?.details, shown),
      visible: isActionVisible(config.rowActions?.details),
    },
    {
      key: "edit",
      label: builtInLabel(context, "edit", t("dms.button.edit")),
      icon: builtInIcon(context, "edit", "i-ph-pencil"),
      onSelect: onRow(rowData, (row) => config.emits("edit", row)),
      disabled: isActionDisabled(context, config.rowActions?.edit, shown),
      visible: isActionVisible(config.rowActions?.edit),
    },
    {
      key: "duplicate",
      label: builtInLabel(context, "duplicate", t("dms.button.duplicate")),
      icon: builtInIcon(context, "duplicate", "i-ph-copy"),
      onSelect: onRow(rowData, (row) =>
        config.emits("duplicate", rowIdOf(row, config.rowIdKey)),
      ),
      disabled: isActionDisabled(context, config.rowActions?.duplicate, shown),
      visible: isActionVisible(config.rowActions?.duplicate),
    },
    {
      key: "delete",
      label: builtInLabel(context, "delete", t("dms.button.delete")),
      icon: builtInIcon(context, "delete", "i-ph-trash"),
      onSelect: onRow(rowData, (row) =>
        config.emits("delete", [rowIdOf(row, config.rowIdKey)]),
      ),
      disabled: isActionDisabled(context, config.rowActions?.delete, shown),
      visible: isActionVisible(config.rowActions?.delete),
      color: Color.error,
    },
    {
      key: "archive",
      label: builtInLabel(context, "archive", t("dms.button.archive")),
      icon: builtInIcon(context, "archive", "i-ph-archive"),
      onSelect: onRow(rowData, (row) =>
        config.emits("archive", [rowIdOf(row, config.rowIdKey)]),
      ),
      disabled: isActionDisabled(context, config.rowActions?.archive, shown),
      visible: isActionVisible(config.rowActions?.archive),
    },
    {
      key: "restore",
      label: builtInLabel(context, "restore", t("dms.button.restore")),
      icon: builtInIcon(context, "restore", "i-ph-arrow-counter-clockwise"),
      onSelect: onRow(rowData, (row) =>
        config.emits("restore", [rowIdOf(row, config.rowIdKey)]),
      ),
      disabled: isActionDisabled(context, config.rowActions?.restore, shown),
      visible: isActionVisible(config.rowActions?.restore),
    },
  ];
};

export const buildRowActionDescriptors = <T extends Data>(
  context: TableColumnContext<T>,
  rowData: T | undefined,
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
