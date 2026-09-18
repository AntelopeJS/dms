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

const SETTINGS_PATH = "/settings";
const MODULES_PATH = "/modules";
const MODULES_TREE_KEY = "modules";
const SETTINGS_ICON = "i-ph-gear-light";
const MODULES_ICON = "i-ph-squares-four-light";
const BACK_ICON = "i-ph-arrow-left-light";
const ESCAPE_KEY = "Escape";

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { processI18n } = useTranslation();
const route = useDmsRoute();
const { open: sidebarOpen, collapsed: sidebarCollapsed } = useSidebarState();

function closeMobileSidebar(event?: KeyboardEvent): void {
  if (event && event.key !== ESCAPE_KEY) return;
  sidebarOpen.value = false;
}

onMounted(() => window.addEventListener("keydown", closeMobileSidebar));
onBeforeUnmount(() =>
  window.removeEventListener("keydown", closeMobileSidebar),
);

const siteLayout = useSiteLayout();
if (!siteLayout.siteLayout.value) {
  void siteLayout.loadSiteLayout();
}

const favoritePages = useFavoritePages();

favoritePages.cleanupInvalidFavorites(
  (path) => siteLayout.findMatchingRoute(path) !== null,
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
        children: favoritePages.sortedFavorites.value.map((favorite) => ({
          label: processI18n(favorite.title),
          icon: favorite.icon || DEFAULT_PAGE_ICON,
          to: favorite.path,
        })),
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
        label: t("menu.section.settings"),
        to: SETTINGS_PATH,
        icon: SETTINGS_ICON,
      },
      currentFullId.value,
      currentRoute.value,
    ),
  );

  if (isOwner.value) {
    result.push({
      label: t("menu.modules"),
      to: MODULES_PATH,
      icon: MODULES_ICON,
      exact: true,
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
    :ui="{
      footer: 'lg:border-t lg:border-default',
      toggle: 'hidden',
    }"
    :toggle="false"
    collapsible
    resizable
    class="bg-default"
    :class="{
      'fixed inset-y-0 start-0 z-50 flex w-80 max-w-[85vw] shadow-xl':
        sidebarOpen,
    }"
  >
    <template #header="{ collapsed }">
      <DmsLink :to="homepage" class="flex w-full justify-center">
        <UColorModeImage
          :light="
            collapsed
              ? appConfig.branding?.logo?.collapsed.light
              : appConfig.branding?.logo?.default.light
          "
          :dark="
            collapsed
              ? appConfig.branding?.logo?.collapsed.dark
              : appConfig.branding?.logo?.default.dark
          "
          class="h-14 w-auto object-contain"
          :alt="t('navigation.goToHomepage')"
        />
      </DmsLink>
    </template>

    <template #default="{ collapsed }">
      <component
        :is="widget.component"
        v-for="widget in widgetsAboveSearchBar"
        :key="widget.id"
        :collapsed="collapsed"
      />

      <UDashboardSearchButton
        :collapsed="collapsed"
        :label="t('commandPalette.button')"
        :kbds="['⌘K']"
        icon="i-ph-magnifying-glass-light"
        variant="outline"
        class="border-default bg-elevated text-dimmed hover:border-accented hover:bg-elevated hover:text-muted w-full justify-between rounded-md border px-2.5 py-2 text-[12.5px] font-normal"
        :ui="{
          base: 'gap-2',
          leadingIcon: 'size-[15px]',
          trailing:
            '[&>kbd]:rounded-[4px] [&>kbd]:border [&>kbd]:border-accented [&>kbd]:px-[5px] [&>kbd]:py-px [&>kbd]:text-[10px] [&>kbd]:font-normal [&>kbd]:tracking-normal',
        }"
      />

      <div
        v-if="currentModule"
        class="border-primary/25 bg-primary/5 flex items-center gap-3 rounded-md border px-3 py-2.5"
        :class="{ 'justify-center': collapsed }"
      >
        <span
          class="border-primary/25 bg-default text-primary grid size-[30px] shrink-0 place-items-center rounded-lg border"
        >
          <UIcon :name="currentModule.info.icon" class="size-4" />
        </span>
        <span
          v-if="!collapsed"
          class="text-highlighted min-w-0 truncate text-sm font-semibold"
        >
          {{ processI18n(currentModule.info.title) }}
        </span>
      </div>

      <component
        :is="widget.component"
        v-for="widget in widgetsBelowSearchBar"
        :key="widget.id"
        :collapsed="collapsed"
      />

      <DmsNavigationMenu
        v-if="favoriteItems.length > 0"
        :collapsed="collapsed"
        :items="favoriteItems"
        orientation="vertical"
      />

      <DmsNavigationMenu
        v-model="openCategories"
        :collapsed="collapsed"
        :items="items"
        orientation="vertical"
      />
    </template>

    <template #footer="{ collapsed }">
      <DmsNavigationMenu
        v-if="footerItems.length > 0"
        :collapsed="collapsed"
        :items="footerItems"
        orientation="vertical"
        class="w-full"
      />
    </template>
  </UDashboardSidebar>

  <DmsDashboardSearch />
</template>

<style>
[data-slot="toggle"][aria-label$="sidebar"] {
  display: none !important;
}
</style>
