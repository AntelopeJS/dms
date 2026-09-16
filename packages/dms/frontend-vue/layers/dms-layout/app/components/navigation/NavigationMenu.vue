<script setup lang="ts">
import type { AvatarProps, NavigationMenuItem } from "@nuxt/ui";

interface Props {
  items: NavigationMenuItem[] | NavigationMenuItem[][];
  collapsed?: boolean;
  orientation?: "horizontal" | "vertical";
  modelValue?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  orientation: "vertical",
  modelValue: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

// When no v-model is bound, leave each AccordionRoot fully uncontrolled —
// Reka's own defaultOpen handling takes over and we skip the sync component
// entirely.
const controlled = computed(() => Array.isArray(props.modelValue));

const isArrayOfArrays = (
  items: NavigationMenuItem[] | NavigationMenuItem[][],
): items is NavigationMenuItem[][] => {
  return Array.isArray(items[0]);
};

// Semantic fields declared on a page or by a dynamic menu provider are turned
// into Nuxt UI item props here, so the registration side never ships classes.
interface MenuVariantClasses {
  link?: string;
  leadingIcon?: string;
}

const VARIANT_CLASSES: Record<MenuItemVariant, MenuVariantClasses> = {
  default: {},
  accent: { link: "text-primary", leadingIcon: "text-primary" },
};

const STATUS_DOT_ICON = "i-ph-circle-fill";
const STATUS_DOT_SIZE = "size-2";

/** The per-item slot classes Nuxt UI accepts on a navigation menu item. */
type MenuItemUi = NonNullable<DmsMenuItem["ui"]>;

/**
 * Nuxt UI derives that map with `Pick` over its slot record, so every slot
 * reads as required even though an item only ever overrides a few of them.
 * Overrides are layered on top of this record, which leaves the rest to the
 * theme. A slot renamed upstream shows up here as a compile error.
 */
const UNSET_MENU_ITEM_UI: MenuItemUi = {
  item: undefined,
  label: undefined,
  link: undefined,
  content: undefined,
  linkLeadingAvatarSize: undefined,
  linkLeadingAvatar: undefined,
  linkLeadingIcon: undefined,
  linkLeadingChipSize: undefined,
  linkLabel: undefined,
  linkLabelExternalIcon: undefined,
  linkTrailing: undefined,
  linkTrailingBadgeSize: undefined,
  linkTrailingBadge: undefined,
  linkTrailingIcon: undefined,
  childList: undefined,
  childLabel: undefined,
  childItem: undefined,
  childLink: undefined,
  childLinkIcon: undefined,
  childLinkWrapper: undefined,
  childLinkLabel: undefined,
  childLinkLabelExternalIcon: undefined,
  childLinkDescription: undefined,
};

function buildItemUi(
  item: DmsMenuItem,
  variant: MenuVariantClasses,
  statusClass: string | undefined,
): MenuItemUi | undefined {
  const overrides: Partial<MenuItemUi> = { ...item.ui };
  if (variant.leadingIcon) {
    overrides.linkLeadingIcon = variant.leadingIcon;
  }
  if (statusClass) {
    overrides.linkTrailingIcon = `${STATUS_DOT_SIZE} ${statusClass}`;
  }
  return Object.keys(overrides).length > 0
    ? { ...UNSET_MENU_ITEM_UI, ...overrides }
    : undefined;
}

// A status dot lands in the trailing slot, which a parent entry already uses for
// its accordion chevron — so it is rendered on leaf entries only.
function decorateMenuItem(item: DmsMenuItem): DmsMenuItem {
  const variant = VARIANT_CLASSES[item.variant ?? "default"];
  const hasChildren = (item.children?.length ?? 0) > 0;
  const statusClass =
    item.status && !hasChildren
      ? MENU_STATUS_TEXT_CLASSES[item.status]
      : undefined;
  const ui = buildItemUi(item, variant, statusClass);

  return {
    ...item,
    ...(variant.link ? { class: [item.class, variant.link] } : {}),
    ...(statusClass ? { trailingIcon: STATUS_DOT_ICON } : {}),
    ...(ui ? { ui } : {}),
    children: item.children?.map(decorateMenuItem),
  };
}

// Normalized to groups for both renderings: UNavigationMenu wraps a flat list
// in a single group itself, so one shape serves the expanded and the collapsed
// branch.
const groupedItems = computed((): NavigationMenuItem[][] => {
  if (!props.items || props.items.length === 0) {
    return [];
  }

  const groups = isArrayOfArrays(props.items) ? props.items : [props.items];
  return groups.map((group) => group.map(decorateMenuItem));
});

const { prefetchPageLayout } = usePrefetch();

function onMenuMouseover(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest("a[href]");
  if (!target) return;

  const href = target.getAttribute("href");
  if (href && href.startsWith("/")) {
    prefetchPageLayout(stripQueryAndHash(href));
  }
}

function isDesiredOpen(id: string): boolean {
  return props.modelValue?.includes(id) ?? false;
}

function onStateChange(id: string, open: boolean): void {
  if (!props.modelValue) return;
  const set = new Set(props.modelValue);
  if (open) set.add(id);
  else set.delete(id);
  const next = [...set];
  if (
    next.length === props.modelValue.length &&
    next.every((value, index) => value === props.modelValue![index])
  ) {
    return;
  }
  emit("update:modelValue", next);
}
</script>

<template>
  <UNavigationMenu
    v-if="!collapsed"
    :items="groupedItems"
    :orientation="orientation"
    :highlight="orientation === 'vertical'"
    value-key="id"
    @mouseover="onMenuMouseover"
  >
    <template #item-leading="{ item, active, ui }">
      <DmsAccordionItemSync
        v-if="
          controlled &&
          orientation === 'vertical' &&
          item.children?.length &&
          typeof item.id === 'string'
        "
        :item-id="item.id"
        :is-desired-open="isDesiredOpen"
        @state-change="onStateChange"
      />
      <UAvatar
        v-if="item.avatar"
        :size="ui.linkLeadingAvatarSize() as AvatarProps['size']"
        v-bind="item.avatar"
        :class="
          ui.linkLeadingAvatar({
            class: item.ui?.linkLeadingAvatar,
            active,
            disabled: !!item.disabled,
          })
        "
      />
      <UIcon
        v-else-if="item.icon"
        :name="item.icon"
        :class="
          ui.linkLeadingIcon({
            class: item.ui?.linkLeadingIcon,
            active,
            disabled: !!item.disabled,
          })
        "
      />
    </template>
  </UNavigationMenu>

  <nav v-else class="flex flex-col gap-1">
    <template v-for="(group, groupIndex) in groupedItems" :key="groupIndex">
      <div v-if="groupIndex > 0" class="border-default my-1 border-t" />
      <ul class="flex flex-col items-center gap-1">
        <li v-for="(item, itemIndex) in group" :key="itemIndex">
          <DmsCollapsedMenuItem
            v-if="item.type !== 'label'"
            :item="item"
            :is-top-level="true"
          />
        </li>
      </ul>
    </template>
  </nav>
</template>
