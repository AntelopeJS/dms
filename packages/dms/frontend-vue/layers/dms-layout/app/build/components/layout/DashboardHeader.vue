<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from "@nuxt/ui";
import NotificationPopover from "../notification/NotificationPopover.vue";
import QuickActionsPopover from "./QuickActionsPopover.vue";
import { useSidebarState } from "./sidebarState";

const BUILDER_POPOVER_OPEN_DELAY_MS = 80;

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { open: sidebarOpen, collapsed: sidebarCollapsed } = useSidebarState();

// Modules register their own header buttons through this generic registry, so
// core has no knowledge of any specific module.
const { actions: registeredActions } = useHeaderActions();

// The builder button is the one exception: it exists in the chrome whether or
// not a module backs it, so the action that claims it drives it instead of
// being rendered as another icon beside it.
const builderAction = computed(() =>
  registeredActions.value.find((action) => action.id === BUILDER_ACTION_ID),
);
const headerActions = computed(() =>
  registeredActions.value.filter((action) => action.id !== BUILDER_ACTION_ID),
);

const { user } = useCurrentUser();
const { logout } = useLogout();

const userMenuOptions = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: user.value?.name,
      type: "label" as const,
    },
  ],
  [
    ...ACCOUNT_MENU_ENTRIES.map((entry) => ({
      label: t(entry.labelKey),
      icon: entry.icon,
      to: entry.to,
    })),
    {
      label: t("button.logout"),
      icon: "i-ph-sign-out-light",
      color: "error",
      onSelect: () => {
        void logout();
      },
    },
  ],
]);

const route = useDmsRoute();
const homepage = useHomepage();
const siteLayout = useSiteLayout();
const { processI18n } = useTranslation();
const favoritePages = useFavoritePages();

const currentPageInfo = computed((): FavoritePage | null => {
  const currentPath = route.path;
  const matchedRoute = siteLayout.findMatchingRoute(currentPath);

  if (!matchedRoute) {
    return null;
  }

  return {
    id: matchedRoute.metadata.id || currentPath,
    path: currentPath,
    title:
      matchedRoute.metadata.displayName ||
      route.name?.toString() ||
      currentPath,
    icon: matchedRoute.metadata.icon,
  };
});

const isCurrentPageFavorite = computed(() => {
  if (!currentPageInfo.value) {
    return false;
  }
  return favoritePages.isFavorite(currentPageInfo.value.path);
});

const toggleCurrentPageFavorite = () => {
  if (!currentPageInfo.value) {
    return;
  }
  favoritePages.toggleFavorite(currentPageInfo.value);
};

const breadcrumb = computed((): BreadcrumbItem[] => {
  const base: BreadcrumbItem[] = [{ label: "home", to: homepage || "/" }];

  if (route.fullPath === (homepage || "/")) {
    return base;
  }

  const paths = route.fullPath.split("/").filter((path) => path);

  return base.concat(
    paths
      .map((path, index): BreadcrumbItem | null => {
        const to = `/${paths.slice(0, index + 1).join("/")}`;

        const matchingRoute = siteLayout.findMatchingRouteOrCategory(to);

        if (!matchingRoute) {
          return null;
        }

        const isPage = "layoutUrl" in matchingRoute.metadata;

        return {
          label: processI18n(matchingRoute.metadata?.displayName || path),
          ...(isPage ? { to } : {}),
        };
      })
      .filter((item) => item !== null),
  );
});

const mobileBreadcrumb = computed(
  (): (BreadcrumbItem & { children?: DropdownMenuItem[] })[] => {
    if (breadcrumb.value.length <= 2) {
      return breadcrumb.value;
    }

    return [
      { icon: "i-ph-house-light", to: "/" },
      {
        icon: "i-ph-dots-three-light",
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
          color="neutral"
          variant="ghost"
          :icon="
            sidebarOpen ? appConfig.ui.icons.close : appConfig.ui.icons.menu
          "
          :aria-label="sidebarOpen ? 'Close sidebar' : 'Open sidebar'"
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="sidebarOpen = !sidebarOpen"
        />
        <UButton
          class="hidden lg:flex"
          color="neutral"
          variant="ghost"
          :icon="
            sidebarCollapsed
              ? appConfig.ui.icons.panelOpen
              : appConfig.ui.icons.panelClose
          "
          :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="sidebarCollapsed = !sidebarCollapsed"
        />

        <UButton
          :icon="isCurrentPageFavorite ? 'i-ph-star-fill' : 'i-ph-star-light'"
          variant="ghost"
          :color="isCurrentPageFavorite ? 'primary' : 'neutral'"
          :disabled="!currentPageInfo"
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="toggleCurrentPageFavorite"
        />
      </template>

      <template #title>
        <UBreadcrumb
          :items="breadcrumb"
          :ui="{ linkLabel: 'first-letter:uppercase' }"
          class="hidden md:block"
        />
      </template>

      <template #right>
        <UButton
          v-if="builderAction"
          :icon="builderAction.icon || 'i-ph-hammer-light'"
          variant="ghost"
          :color="builderAction.isActive?.() ? 'primary' : 'neutral'"
          :title="builderAction.label"
          :aria-label="builderAction.label"
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="builderAction.onSelect()"
        />

        <UPopover
          v-else
          mode="hover"
          :open-delay="BUILDER_POPOVER_OPEN_DELAY_MS"
          :content="{ align: 'end', side: 'bottom' }"
          :ui="{ content: 'w-72' }"
        >
          <UButton
            icon="i-ph-hammer-light"
            variant="ghost"
            color="neutral"
            :title="t('builder.button')"
            :aria-label="t('builder.button')"
            :ui="{ leadingIcon: 'size-[18px]' }"
          />

          <template #content>
            <div class="flex flex-col gap-2 p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-highlighted text-sm font-semibold">
                  {{ t("builder.title") }}
                </p>
                <UBadge color="primary" variant="subtle" size="sm">
                  {{ t("builder.soon") }}
                </UBadge>
              </div>
              <p class="text-muted text-xs leading-relaxed">
                {{ t("builder.description") }}
              </p>
            </div>
          </template>
        </UPopover>

        <UButton
          v-for="action in headerActions"
          :key="action.id"
          :icon="action.icon"
          variant="ghost"
          color="neutral"
          :title="action.label"
          :aria-label="action.label"
          :ui="{ leadingIcon: 'size-[18px]' }"
          @click="action.onSelect?.()"
        />

        <QuickActionsPopover />

        <NotificationPopover />

        <UDropdownMenu :items="userMenuOptions" :ui="{ content: 'w-48' }" arrow>
          <UButton
            icon="i-ph-user-light"
            variant="ghost"
            color="neutral"
            :ui="{ leadingIcon: 'size-[18px]' }"
          />
        </UDropdownMenu>
      </template>
    </UDashboardNavbar>

    <div class="border-default border-b px-6 py-2 md:hidden">
      <UBreadcrumb
        :items="mobileBreadcrumb"
        :ui="{ linkLabel: 'first-letter:uppercase' }"
      />
    </div>
  </div>
</template>
