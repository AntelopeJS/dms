<script setup lang="ts">
import type { AvatarProps, NavigationMenuItem } from "@nuxt/ui";
import { useNavBadges } from "#dms-ui/app/build/composables/navigation/useNavBadges";
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { PREVIEW_LOCK_ICON } from "#dms-ui/app/build/utils/permissionPreview";
import {
  applyPreviewEntryStates,
  type PreviewEntryState,
} from "#dms-core/app/build/utils/permission-preview";

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
const STATUS_DOT_SIZE = "size-1.5";
/** v2 nav trail badge: a small neutral pill with a mono count. */
const MENU_BADGE_PROPS = {
  color: "neutral",
  variant: "soft",
  size: "sm",
  class: "font-mono tabular-nums",
} as const;

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

// A plain badge value (a page's `badge`) gets the v2 look; a badge already
// given as props is the caller's own choice.
function resolveMenuBadge(badge: DmsMenuItem["badge"]): DmsMenuItem["badge"] {
  if (typeof badge === "string" || typeof badge === "number") {
    return { ...MENU_BADGE_PROPS, label: String(badge) };
  }
  return badge;
}

// "Preview as role": an entry the previewed role could not open stays in the
// menu, hatched red and locked, so the preview shows what the role loses
// instead of a shorter menu; one it opens without all of it (a block or an
// action of its page, or one of its entries) is hatched orange with the same
// lock. Labels and parents are drawn too; a parent keeps its trailing slot
// for the chevron and shows the lock in place of its icon. Outside a preview
// `entryState` is always null: nothing is ever drawn.
const preview = usePermissionPreview();
const { t } = useI18n();
const PREVIEW_ENTRY_LINK_CLASSES: Record<PreviewEntryState, string> = {
  hidden: "text-muted dms-hatch-locked",
  partial: "dms-hatch-partial",
};
const PREVIEW_LOCK_TONES: Record<PreviewEntryState, string> = {
  hidden: "text-error",
  partial: "text-warning",
};
const PREVIEW_ENTRY_TITLES: Record<PreviewEntryState, string> = {
  hidden: "page.settings.roles.preview.menu_hidden",
  partial: "page.settings.roles.preview.menu_partial",
};

function drawPreviewEntry(
  item: DmsMenuItem,
  state: PreviewEntryState,
): DmsMenuItem {
  const hasChildren = (item.children?.length ?? 0) > 0;
  const title = t(PREVIEW_ENTRY_TITLES[state], {
    role: preview.session.value?.roleName ?? "",
  });
  return {
    ...item,
    previewState: state,
    previewLocked: state === "hidden",
    class: [item.class, PREVIEW_ENTRY_LINK_CLASSES[state]],
    title,
    "aria-label": `${String(item.label ?? "")} · ${title}`,
    ...(hasChildren
      ? {}
      : {
          trailingIcon: PREVIEW_LOCK_ICON,
          badge: undefined,
          ui: {
            ...UNSET_MENU_ITEM_UI,
            ...item.ui,
            linkTrailingIcon: `size-3.5 ${PREVIEW_LOCK_TONES[state]}`,
          },
        }),
  };
}

// The count a table view published for the page (`navBadge`) is fresher than
// the one the server counted when the menu loaded; `""` stands for none.
const { badges: navBadges } = useNavBadges();

function badgeOf(item: DmsMenuItem): DmsMenuItem["badge"] {
  const live =
    item.fullId === undefined ? undefined : navBadges.value[item.fullId];
  if (live === undefined) return item.badge;
  return live || undefined;
}

// A status dot lands in the trailing slot, which a parent entry already uses for
// its accordion chevron — so it is rendered on leaf entries only, and a badge
// takes precedence over it.
function decorateMenuItem(item: DmsMenuItem): DmsMenuItem {
  const variant = VARIANT_CLASSES[item.variant ?? "default"];
  const hasChildren = (item.children?.length ?? 0) > 0;
  const badge = resolveMenuBadge(badgeOf(item));
  const statusClass =
    item.status && !hasChildren && !badge
      ? MENU_STATUS_TEXT_CLASSES[item.status]
      : undefined;
  const ui = buildItemUi(item, variant, statusClass);

  return {
    ...item,
    ...(variant.link ? { class: [item.class, variant.link] } : {}),
    ...(statusClass ? { trailingIcon: STATUS_DOT_ICON } : {}),
    badge,
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
  return groups.map((group) =>
    applyPreviewEntryStates(
      group.map(decorateMenuItem),
      preview.entryState,
      drawPreviewEntry,
    ),
  );
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
        v-else-if="item.previewState && item.children?.length"
        :name="PREVIEW_LOCK_ICON"
        :class="
          ui.linkLeadingIcon({
            class: PREVIEW_LOCK_TONES[item.previewState as PreviewEntryState],
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
