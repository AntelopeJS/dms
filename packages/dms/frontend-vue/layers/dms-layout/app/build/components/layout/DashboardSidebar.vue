<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import {
  convertSiteLayoutTreeToTreeItems,
  convertSiteLayoutTreeToTreeItemsForModule,
} from "#dms-ui/app/build/types/tree";
import {
  isSidebarWidgetVisible,
  resolveSidebarWidgetPosition,
  SidebarWidgetPosition,
} from "../../../composables/useSidebarWidgets";
import { useSidebarState } from "./sidebarState";
import { useKeyboardPlatform } from "#dms-ui/app/composables/global/keyboardPlatform";
import { useMediaQuery } from "@vueuse/core";

const SETTINGS_PATH = "/settings";
const MODULES_PATH = "/modules";
// Registered ids of the footer entries, so "Preview as role" can lock them.
const SETTINGS_FULL_ID = "settings";
const MODULES_FULL_ID = "modules";
const MODULES_TREE_KEY = "modules";
const SETTINGS_ICON = "i-ph-gear-six-light";
const MODULES_ICON = "i-ph-squares-four-light";
const BACK_ICON = "i-ph-arrow-left-light";
const ESCAPE_KEY = "Escape";
const SIDEBAR_DEFAULT_WIDTH_PX = 240;
const SIDEBAR_MIN_WIDTH_PX = 200;
const SIDEBAR_MAX_WIDTH_PX = 320;
const SIDEBAR_COLLAPSED_WIDTH_PX = 60;
const SEARCH_SHORTCUT_KEYS = ["meta", "k"];
const DESKTOP_QUERY = "(min-width: 1024px)";
// On a short screen the menu overflows the body, which then scrolls: without
// this the flex column squeezed the search field and widgets instead.
const SIDEBAR_UI = { body: "*:shrink-0" };

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { processI18n } = useTranslation();
const route = useDmsRoute();
const { open: sidebarOpen, collapsed: sidebarCollapsed } = useSidebarState();
const { formatShortcut } = useKeyboardPlatform();
// The palette's own key (Nuxt UI binds `meta_k`: ⌘ on macOS, Ctrl elsewhere),
// printed for the platform: "⌘K" or "Ctrl K".
const searchShortcutHint = computed(() => formatShortcut(SEARCH_SHORTCUT_KEYS));
// The collapsed rail shows only the icon: its tooltip (shown only while
// collapsed, labelled with the button's label) adds the key.
const searchTooltip = computed(() => ({ kbds: [searchShortcutHint.value] }));

function closeMobileSidebar(event?: KeyboardEvent): void {
  if (event && event.key !== ESCAPE_KEY) return;
  sidebarOpen.value = false;
}

// The drawer only exists below `lg`: widening past it (a tablet turned to
// landscape) closes it, so the desktop sidebar never stays pinned as one.
const isDesktop = useMediaQuery(DESKTOP_QUERY);
watch(isDesktop, (desktop) => {
  if (desktop) sidebarOpen.value = false;
});

// Going to a page closes the drawer, wherever the navigation came from (a
// menu link, the user menu, the palette).
watch(
  () => route.path,
  () => closeMobileSidebar(),
);

// A link to the page already shown changes no route: close on the click.
function closeOnLinkClick(event: MouseEvent): void {
  if (!sidebarOpen.value) return;
  if ((event.target as Element | null)?.closest("a[href]")) {
    closeMobileSidebar();
  }
}

// The drawer always shows the full menu, even when the desktop sidebar was
// collapsed to its rail.
const isRail = (collapsed: boolean): boolean => collapsed && !sidebarOpen.value;

onMounted(() => window.addEventListener("keydown", closeMobileSidebar));
onBeforeUnmount(() =>
  window.removeEventListener("keydown", closeMobileSidebar),
);

const siteLayout = useSiteLayout();
if (!siteLayout.siteLayout.value) {
  void siteLayout.loadSiteLayout();
}

const favoritePages = useFavoritePages();

favoritePages.cleanupInvalidFavorites((path) =>
  isFavoritePathValid(path, siteLayout.findMatchingRoute),
);

const isOwner = useIsOwner();
const currentModule = useCurrentModule();
const isInModule = computed(() => currentModule.value !== null);
const { widgets: sidebarWidgets } = useSidebarWidgets();
// Scope and position are independent axes: a widget renders where its
// `position` says, but only while its module — none for a global one — is the
// one being browsed.
const visibleSidebarWidgets = computed(() =>
  sidebarWidgets.value.filter((widget) =>
    isSidebarWidgetVisible(widget, currentModule.value?.id),
  ),
);
const widgetsAtPosition = (position: SidebarWidgetPosition) =>
  computed(() =>
    visibleSidebarWidgets.value.filter(
      (widget) => resolveSidebarWidgetPosition(widget) === position,
    ),
  );
const widgetsAboveSearchBar = widgetsAtPosition(
  SidebarWidgetPosition.ABOVE_SEARCH_BAR,
);
const widgetsBelowSearchBar = widgetsAtPosition(
  SidebarWidgetPosition.BELOW_SEARCH_BAR,
);
const homepage = useHomepage();

// Use the matched page/category's `fullId` to drive sidebar expansion.
// URL-based matching would miss hidden pages (registered but not in the menu
// tree) and custom-pages whose urlSlug escapes the parent category's URL.
const currentFullId = computed(() => {
  const match = siteLayout.findMatchingRouteOrCategory(route.path);
  return match?.metadata.fullId ?? null;
});

// Query parameters are part of the highlight: several entries can share one page
// and only differ by them (`/project?project=<id>`).
const currentRoute = computed<MenuRouteState>(() => ({
  path: route.path,
  query: route.query,
}));

const moduleRootNode = computed(() => {
  if (!currentModule.value || !siteLayout.siteLayoutTree.value) {
    return null;
  }
  const modulesNode =
    siteLayout.siteLayoutTree.value.children[MODULES_TREE_KEY];
  if (!modulesNode) return null;
  for (const childId of modulesNode.childrenOrders) {
    const child = modulesNode.children[childId];
    if (child?.isModuleRoot && child.id === currentModule.value.id) {
      return child;
    }
  }
  return null;
});

const favoriteItems = computed((): NavigationMenuItem[][] => {
  if (isInModule.value) {
    return [];
  }

  if (favoritePages.sortedFavorites.value.length === 0) {
    return [];
  }

  return [
    [
      {
        label: t("menu.favorites"),
        icon: "i-ph-star-light",
        defaultOpen: true,
        children: favoritePages.sortedFavorites.value.map(
          (favorite): DmsMenuItem => ({
            // The page's registered id, for the preview's locks.
            fullId: siteLayout.findMatchingRoute(
              stripQueryAndHash(favorite.path),
            )?.metadata.fullId,
            label: processI18n(favorite.title),
            icon: favorite.icon || DEFAULT_PAGE_ICON,
            to: favorite.path,
          }),
        ),
      },
    ],
  ];
});

const items = computed((): NavigationMenuItem[][] => {
  if (isInModule.value) {
    if (!moduleRootNode.value) {
      return [];
    }
    const moduleMenuItems = convertSiteLayoutTreeToTreeItemsForModule(
      moduleRootNode.value,
    );
    const translatedItems = translateMenuItems(moduleMenuItems, processI18n);
    const openItems = addDefaultOpenToMenuItems(
      translatedItems,
      currentFullId.value,
    );
    return addActiveStateToMenuItems(
      openItems,
      currentFullId.value,
      currentRoute.value,
    );
  }

  if (!siteLayout.siteLayoutTree.value) {
    return [];
  }

  const menuItems = convertSiteLayoutTreeToTreeItems(
    siteLayout.siteLayoutTree.value,
  );
  const translatedItems = translateMenuItems(menuItems, processI18n);
  const openItems = addDefaultOpenToMenuItems(
    translatedItems,
    currentFullId.value,
  );
  return addActiveStateToMenuItems(
    openItems,
    currentFullId.value,
    currentRoute.value,
  );
});

const openCategories = ref<string[]>([]);

watch(
  () => items.value,
  (menuItems) => {
    const requiredIds = getExpandedItemIds(menuItems, currentFullId.value);
    const current = new Set(openCategories.value);
    for (const id of requiredIds) {
      current.add(id);
    }
    openCategories.value = [...current];
  },
  { immediate: true },
);

const moduleCount = computed(() => {
  const modulesNode =
    siteLayout.siteLayoutTree.value?.children[MODULES_TREE_KEY];
  if (!modulesNode) return 0;
  return modulesNode.childrenOrders.filter(
    (childId) => modulesNode.children[childId]?.isModuleRoot,
  ).length;
});

const footerItems = computed((): NavigationMenuItem[] => {
  const result: NavigationMenuItem[] = [];

  if (isInModule.value) {
    result.push({
      label: t("menu.back"),
      icon: BACK_ICON,
      to: isOwner.value ? MODULES_PATH : homepage,
      exact: true,
    });
  }

  // Settings highlights its sub-pages; Back and Modules only highlight their
  // destinations, regardless of the router's default prefix matching.
  result.push(
    addActiveStateToMenuItem(
      {
        fullId: SETTINGS_FULL_ID,
        label: t("menu.section.settings"),
        to: SETTINGS_PATH,
        icon: SETTINGS_ICON,
      } as DmsMenuItem,
      currentFullId.value,
      currentRoute.value,
    ),
  );

  if (isOwner.value) {
    result.push({
      fullId: MODULES_FULL_ID,
      label: t("menu.modules"),
      to: MODULES_PATH,
      icon: MODULES_ICON,
      exact: true,
      ...(moduleCount.value > 0
        ? {
            badge: {
              label: String(moduleCount.value),
              color: "neutral",
              variant: "subtle",
              size: "sm",
            },
          }
        : {}),
    });
  }

  return result;
});
</script>

<template>
  <button
    v-if="sidebarOpen"
    type="button"
    aria-hidden="true"
    tabindex="-1"
    class="bg-elevated/75 fixed inset-0 z-40 lg:hidden"
    @click="closeMobileSidebar()"
  />

  <UDashboardSidebar
    data-dms-persistent-sidebar
    :open="false"
    v-model:collapsed="sidebarCollapsed"
    :default-size="SIDEBAR_DEFAULT_WIDTH_PX"
    :min-size="SIDEBAR_MIN_WIDTH_PX"
    :max-size="SIDEBAR_MAX_WIDTH_PX"
    :collapsed-size="SIDEBAR_COLLAPSED_WIDTH_PX"
    :toggle="false"
    :ui="SIDEBAR_UI"
    collapsible
    resizable
    class="bg-(--dms-bg-sidebar)"
    :class="{
      'fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw] shadow-xl':
        sidebarOpen,
    }"
    @click="closeOnLinkClick"
  >
    <template #header="{ collapsed: sidebarRail }">
      <DmsLink
        :to="homepage"
        class="flex w-full items-center"
        :class="{ 'justify-center': isRail(sidebarRail) }"
      >
        <UColorModeImage
          :light="
            isRail(sidebarRail)
              ? appConfig.branding?.logo?.collapsed.light
              : appConfig.branding?.logo?.default.light
          "
          :dark="
            isRail(sidebarRail)
              ? appConfig.branding?.logo?.collapsed.dark
              : appConfig.branding?.logo?.default.dark
          "
          :class="isRail(sidebarRail) ? 'size-7' : 'h-12 w-auto'"
          class="object-contain"
          :alt="t('navigation.goToHomepage')"
        />
      </DmsLink>
    </template>

    <template #default="{ collapsed: sidebarRail }">
      <component
        :is="widget.component"
        v-for="widget in widgetsAboveSearchBar"
        :key="widget.id"
        :collapsed="isRail(sidebarRail)"
      />

      <UDashboardSearchButton
        :collapsed="isRail(sidebarRail)"
        :label="t('commandPalette.button')"
        :kbds="[searchShortcutHint]"
        :tooltip="searchTooltip"
        icon="i-ph-magnifying-glass-light"
        variant="outline"
        class="border-default text-dimmed hover:border-accented hover:text-muted h-8 w-full justify-start rounded-md border bg-(--dms-bg-field) py-0 ps-2.5 pe-1.5 text-[13px] font-normal ring-0 hover:bg-(--dms-bg-field)"
        :ui="{
          base: 'gap-2',
          leadingIcon: 'size-[15px]',
          trailing:
            '[&>kbd]:border-accented [&>kbd]:text-muted [&>kbd]:h-5 [&>kbd]:rounded-[5px] [&>kbd]:border [&>kbd]:border-b-2 [&>kbd]:bg-(--ui-bg) [&>kbd]:px-[5px] [&>kbd]:text-[11px] [&>kbd]:font-medium [&>kbd]:tracking-normal [&>kbd]:ring-0',
        }"
      />

      <div
        v-if="currentModule"
        class="border-primary/35 bg-primary/5 flex items-center gap-2.5 rounded-md border px-2 py-[7px]"
        :class="{ 'justify-center': isRail(sidebarRail) }"
      >
        <span
          class="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-[7px]"
        >
          <UIcon :name="currentModule.info.icon" class="size-4" />
        </span>
        <span
          v-if="!isRail(sidebarRail)"
          class="text-highlighted min-w-0 truncate text-[13px] font-semibold"
        >
          {{ processI18n(currentModule.info.title) }}
        </span>
      </div>

      <component
        :is="widget.component"
        v-for="widget in widgetsBelowSearchBar"
        :key="widget.id"
        :collapsed="isRail(sidebarRail)"
      />

      <DmsNavigationMenu
        v-if="favoriteItems.length > 0"
        :collapsed="isRail(sidebarRail)"
        :items="favoriteItems"
        orientation="vertical"
      />

      <DmsNavigationMenu
        v-model="openCategories"
        :collapsed="isRail(sidebarRail)"
        :items="items"
        orientation="vertical"
      />
    </template>

    <template #footer="{ collapsed: sidebarRail }">
      <DmsNavigationMenu
        v-if="footerItems.length > 0"
        :collapsed="isRail(sidebarRail)"
        :items="footerItems"
        orientation="vertical"
        class="w-full"
      />
      <DmsSidebarUserMenu :collapsed="isRail(sidebarRail)" />
    </template>
  </UDashboardSidebar>

  <DmsDashboardSearch />
</template>

<style>
[data-slot="toggle"][aria-label$="sidebar"] {
  display: none !important;
}
</style>
