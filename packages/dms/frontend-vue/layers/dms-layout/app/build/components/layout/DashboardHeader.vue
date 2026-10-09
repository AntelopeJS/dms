<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from "@nuxt/ui";
import NotificationPopover from "../notification/NotificationPopover.vue";
import QuickActionsPopover from "./QuickActionsPopover.vue";
import { useSidebarState } from "./sidebarState";
import { useHeaderActionControls } from "../../composables/layout/useHeaderActionControls";
import { usePageRecordLabel } from "#dms-core/app/build/composables/page/usePageRecordLabel";

const HOME_ICON = "i-ph-house-light";
/** Breadcrumb slot of the folded middle crumbs on small screens. */
const MOBILE_ELLIPSIS_SLOT = "ellipsis";
/** v2 toolbar buttons: muted until hovered or open. */
const TOOLBAR_BUTTON_CLASS =
  "text-muted hover:text-highlighted data-[state=open]:text-highlighted";
/** The crumb naming a row keeps the row's own case (crumbs capitalize). */
const RECORD_CRUMB_LABEL_CLASS = "first-letter:normal-case";
// Nuxt UI types an item's `ui` as every breadcrumb slot at once; only the
// label is restyled here.
const RECORD_CRUMB_UI = {
  linkLabel: RECORD_CRUMB_LABEL_CLASS,
} as NonNullable<BreadcrumbItem["ui"]>;
/** v2: every icon-only toolbar button names itself in a tooltip below it. */
const TOOLTIP_CONTENT = { side: "bottom", sideOffset: 6 } as const;

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { open: sidebarOpen, collapsed: sidebarCollapsed } = useSidebarState();

// Modules register their own header buttons through this generic registry, so
// core has no knowledge of any specific module.
const { actions: registeredActions } = useHeaderActions();

// The builder button keeps its fixed slot first in the toolbar, and only
// exists when a module (the Builder) registers the action that drives it.
const builderAction = computed(() =>
  registeredActions.value.find((action) => action.id === BUILDER_ACTION_ID),
);
const headerActions = computed(() =>
  registeredActions.value.filter((action) => action.id !== BUILDER_ACTION_ID),
);
const {
  isToggle: isActionToggle,
  isActive: isActionActive,
  select: selectAction,
} = useHeaderActionControls();

const sidebarToggleLabel = computed(() =>
  sidebarCollapsed.value
    ? t("header.expand_sidebar")
    : t("header.collapse_sidebar"),
);

const route = useDmsRoute();
const homepage = useHomepage();
const siteLayout = useSiteLayout();
const { processI18n } = useTranslation();
const favoritePages = useFavoritePages();
// The row an edit or details page is about names its last crumb.
const { label: recordLabel } = usePageRecordLabel();

const currentPageInfo = computed((): FavoritePage | null => {
  const matchedRoute = siteLayout.findMatchingRoute(route.path);

  if (!matchedRoute) {
    return null;
  }

  return buildFavoritePage({
    path: route.path,
    metadata: {
      ...matchedRoute.metadata,
      displayName: matchedRoute.metadata.displayName || route.name?.toString(),
    },
    query: route.query,
    translate: processI18n,
  });
});

const isCurrentPageFavorite = computed(() => {
  if (!currentPageInfo.value) {
    return false;
  }
  return favoritePages.isFavorite(currentPageInfo.value.path);
});

const favoriteLabel = computed(() =>
  isCurrentPageFavorite.value
    ? t("header.remove_favorite")
    : t("header.add_favorite"),
);

const toggleCurrentPageFavorite = () => {
  if (!currentPageInfo.value) {
    return;
  }
  favoritePages.toggleFavorite(currentPageInfo.value);
};

const breadcrumb = computed((): BreadcrumbItem[] => {
  const base: BreadcrumbItem[] = [
    { icon: HOME_ICON, to: homepage || "/", "aria-label": t("header.home") },
  ];

  // The path only: with the query, the last segment ("data?table=x") matched
  // no route and the current page dropped out of the breadcrumb.
  if (route.path === (homepage || "/")) {
    return base;
  }

  const paths = route.path.split("/").filter((path) => path);

  const crumbs = base.concat(
    paths
      .map((path, index): BreadcrumbItem | null => {
        const to = `/${paths.slice(0, index + 1).join("/")}`;

        const matchingRoute = siteLayout.findMatchingRouteOrCategory(to);

        if (!matchingRoute) {
          return null;
        }

        const target = buildBreadcrumbTarget(
          to,
          matchingRoute.metadata,
          route.query,
        );

        return {
          label: processI18n(matchingRoute.metadata?.displayName || path),
          ...(target ? { to: target } : {}),
        };
      })
      .filter((item) => item !== null),
  );

  // Written as the row has it: an email address keeps its lowercase.
  const last = crumbs.at(-1);
  if (recordLabel.value && last && crumbs.length > 1) {
    crumbs[crumbs.length - 1] = {
      ...last,
      label: recordLabel.value,
      ui: RECORD_CRUMB_UI,
    };
  }
  return crumbs;
});

const mobileBreadcrumb = computed(
  (): (BreadcrumbItem & { children?: DropdownMenuItem[] })[] => {
    if (breadcrumb.value.length <= 2) {
      return breadcrumb.value;
    }

    // The middle crumbs fold into a "…" menu (see the `#ellipsis` slot) so a
    // deep page still fits a phone without losing the way back up.
    return [
      breadcrumb.value[0]!,
      {
        slot: MOBILE_ELLIPSIS_SLOT,
        children: breadcrumb.value.slice(1, -1).map((x) => ({
          label: x.label,
          to: x.to,
        })),
      },
      breadcrumb.value.slice(-1)[0]!,
    ];
  },
);
</script>

<template>
  <div data-dms-persistent-header>
    <UDashboardNavbar>
      <template #leading>
        <UButton
          class="lg:hidden"
          :class="TOOLBAR_BUTTON_CLASS"
          color="neutral"
          variant="ghost"
          :icon="
            sidebarOpen ? appConfig.ui.icons.close : appConfig.ui.icons.menu
          "
          :aria-label="
            sidebarOpen ? t('header.close_sidebar') : t('header.open_sidebar')
          "
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="sidebarOpen = !sidebarOpen"
        />
        <UTooltip :text="sidebarToggleLabel" :content="TOOLTIP_CONTENT">
          <UButton
            class="hidden lg:flex"
            :class="TOOLBAR_BUTTON_CLASS"
            color="neutral"
            variant="ghost"
            :icon="
              sidebarCollapsed
                ? appConfig.ui.icons.panelOpen
                : appConfig.ui.icons.panelClose
            "
            :aria-label="sidebarToggleLabel"
            :ui="{ leadingIcon: 'size-[18px]' }"
            @click="sidebarCollapsed = !sidebarCollapsed"
          />
        </UTooltip>
        <span
          aria-hidden="true"
          class="mx-1.5 hidden h-[18px] w-px bg-(--ui-border) lg:block"
        />
      </template>

      <template #title>
        <UBreadcrumb
          :items="breadcrumb"
          :ui="{ linkLabel: 'first-letter:uppercase' }"
          class="hidden md:block"
        >
          <template #separator>
            <span class="text-dimmed text-xs">/</span>
          </template>
        </UBreadcrumb>

        <UTooltip :text="favoriteLabel" :content="TOOLTIP_CONTENT">
          <UButton
            :icon="isCurrentPageFavorite ? 'i-ph-star-fill' : 'i-ph-star-light'"
            variant="ghost"
            size="sm"
            :color="isCurrentPageFavorite ? 'primary' : 'neutral'"
            :class="isCurrentPageFavorite ? undefined : TOOLBAR_BUTTON_CLASS"
            :disabled="!currentPageInfo"
            :aria-label="favoriteLabel"
            :aria-pressed="isCurrentPageFavorite"
            :ui="{ leadingIcon: 'size-4' }"
            @click="toggleCurrentPageFavorite"
          />
        </UTooltip>
      </template>

      <template #right>
        <UTooltip
          v-if="builderAction"
          :text="processI18n(builderAction.label)"
          :content="TOOLTIP_CONTENT"
        >
          <UButton
            :icon="builderAction.icon || 'i-ph-hammer-light'"
            variant="ghost"
            :color="isActionActive(builderAction) ? 'primary' : 'neutral'"
            :class="
              isActionActive(builderAction) ? undefined : TOOLBAR_BUTTON_CLASS
            "
            :aria-label="processI18n(builderAction.label)"
            :aria-pressed="
              isActionToggle(builderAction)
                ? isActionActive(builderAction)
                : undefined
            "
            :ui="{ leadingIcon: 'size-[18px]' }"
            @click="selectAction(builderAction)"
          />
        </UTooltip>

        <UTooltip
          v-for="action in headerActions"
          :key="action.id"
          :text="processI18n(action.label)"
          :content="TOOLTIP_CONTENT"
        >
          <UButton
            :icon="action.icon"
            variant="ghost"
            :color="isActionActive(action) ? 'primary' : 'neutral'"
            :class="isActionActive(action) ? undefined : TOOLBAR_BUTTON_CLASS"
            :aria-label="processI18n(action.label)"
            :aria-pressed="
              isActionToggle(action) ? isActionActive(action) : undefined
            "
            :ui="{ leadingIcon: 'size-[18px]' }"
            @click="selectAction(action)"
          />
        </UTooltip>

        <QuickActionsPopover />

        <NotificationPopover />
      </template>
    </UDashboardNavbar>

    <!-- Same side padding as the navbar above, so the home icon lines up
         with its buttons. -->
    <div class="border-default border-b px-3 py-2 sm:px-4 md:hidden">
      <UBreadcrumb
        :items="mobileBreadcrumb"
        :ui="{ linkLabel: 'first-letter:uppercase' }"
      >
        <template #ellipsis="{ item }">
          <UDropdownMenu :items="item.children" :content="{ align: 'start' }">
            <UButton
              icon="i-ph-dots-three-light"
              color="neutral"
              variant="ghost"
              size="xs"
              class="-my-1"
              :class="TOOLBAR_BUTTON_CLASS"
              :aria-label="t('header.show_path')"
            />
          </UDropdownMenu>
        </template>
      </UBreadcrumb>
    </div>
  </div>
</template>
