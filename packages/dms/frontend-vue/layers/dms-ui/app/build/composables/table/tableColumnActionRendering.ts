import type { Data } from "../../components/table/TableRoot.vue";
import Button from "@nuxt/ui/components/Button.vue";
import DisabledReason from "../../components/button/DisabledReason.vue";
import DropdownMenu, {
  type DropdownMenuItem,
} from "@nuxt/ui/components/DropdownMenu.vue";

import type {
  TableColumnContext,
  RowActionDescriptor,
} from "./tableColumnTypes";

import {
  isShowingArchived,
  isOffMode,
  menuLabel,
  buildRowActionDescriptors,
  isDestructive,
  isOffered,
  descriptorToMenuItem,
} from "./tableColumnActionDescriptors";

const withDisabledReason = (
  descriptor: RowActionDescriptor,
  button: ReturnType<typeof h>,
) =>
  h(
    DisabledReason,
    { reason: descriptor.disabledReason },
    { default: () => button },
  );

const renderActionButton = (descriptor: RowActionDescriptor, rowId: string) => {
  const button = h(Button, {
    id: `row-action-${rowId}-${descriptor.icon || descriptor.label}`,
    "aria-label": descriptor.label,
    title: descriptor.showLabel ? undefined : descriptor.label,
    label: descriptor.showLabel ? descriptor.label : undefined,
    icon: descriptor.icon,
    color: descriptor.color || Color.neutral,
    variant: descriptor.variant ?? ButtonVariant.ghost,
    size: Size.tiny,
    disabled: descriptor.disabled,
    onClick: (event: Event) => {
      event.stopPropagation();
      descriptor.onSelect();
    },
  });
  return withDisabledReason(descriptor, button);
};

const renderActionsDropdown = <T extends Data>(
  context: TableColumnContext<T>,
  items: DropdownMenuItem[] | DropdownMenuItem[][],
  rowId: string,
  label: string,
) => {
  const { appConfig } = context;
  return h(
    DropdownMenu,
    {
      modal: false,
      ui: { content: "min-w-48" },
      items,
    },
    {
      default: () =>
        h(Button, {
          id: `row-actions-${rowId}`,
          "aria-label": label,
          icon: appConfig.ui.icons.ellipsis,
          color: Color.neutral,
          variant: ButtonVariant.ghost,
          size: Size.tiny,
        }),
    },
  );
};

const renderRestoreButton = (
  descriptor: RowActionDescriptor,
  rowId: string,
) => {
  const button = h(Button, {
    id: `row-action-${rowId}-restore`,
    label: descriptor.label,
    icon: descriptor.icon,
    color: Color.neutral,
    variant: ButtonVariant.ghost,
    size: Size.tiny,
    disabled: descriptor.disabled,
    onClick: (event: Event) => {
      event.stopPropagation();
      descriptor.onSelect();
    },
  });
  return withDisabledReason(descriptor, button);
};

export const renderActionsCell = <T extends Data>(
  context: TableColumnContext<T>,
  row: { original: T; id: string },
) => {
  const { config } = context;

  const descriptors = buildRowActionDescriptors(context, row.original).filter(
    (d) => isOffered(d) && !isOffMode(context, d),
  );
  const restoreDescriptor = isShowingArchived(context)
    ? descriptors.find((d) => d.key === "restore")
    : undefined;
  const visibleDescriptors = descriptors.filter(
    (d) => d.visible && d !== restoreDescriptor,
  );
  const menuDescriptors = descriptors.filter(
    (d) => !d.visible && d !== restoreDescriptor,
  );

  const dropdownItems = [
    menuDescriptors.filter((d) => !isDestructive(d)).map(descriptorToMenuItem),
    menuDescriptors.filter(isDestructive).map(descriptorToMenuItem),
  ].filter((group) => group.length > 0);

  if (
    !restoreDescriptor &&
    visibleDescriptors.length === 0 &&
    dropdownItems.length === 0
  ) {
    return null;
  }

  const children = visibleDescriptors.map((d) => renderActionButton(d, row.id));
  if (restoreDescriptor) {
    children.unshift(renderRestoreButton(restoreDescriptor, row.id));
  }
  if (dropdownItems.length > 0) {
    children.push(
      renderActionsDropdown(
        context,
        dropdownItems,
        row.id,
        menuLabel(context, row.original),
      ),
    );
  }

  return h(
    "div",
    {
      class: config.ui.value.rowAction({
        prominent: visibleDescriptors.some((d) => d.showLabel),
      }),
      onClick: (e: Event) => e.stopPropagation(),
    },
    children,
  );
};
