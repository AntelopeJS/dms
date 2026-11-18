<script setup lang="ts">
import type { BreadcrumbItem } from "@nuxt/ui";
import { PREVIEW_NAVIGATION_ATTRIBUTE } from "#dms-ui/app/entries/composables/block-preview/previewNavigation";
import { HOME_ICON, TOOLBAR_BUTTON_CLASS } from "./dashboardNavbar";
import type { PreviewPageStatus } from "#dms-ui/app/entries/utils/blockPreview";
import MockupPageStatusBadge from "./MockupPageStatusBadge.vue";
import { useSidebarState } from "./sidebarState";

/**
 * The dashboard's top bar as a mockup draws it above a page: the navbar of
 * `DashboardHeader` with static data, so the mockup looks as the page will.
 * Nothing in it acts and a reader of the page skips it, but the buttons the
 * sidebar needs: the one that opens it below the dashboard's desktop width,
 * and the one that folds it to its rail above. The icons are those of the
 * header actions of a development dashboard (Mockups), then the
 * quick actions and the bell.
 */
const props = defineProps<{
  title: string;
  /** What the page is beside the live app, badged after its title. */
  status?: PreviewPageStatus;
}>();

const STAR_ICON = "i-ph-star-light";
const RIGHT_ICONS = [
  "i-ph-frame-corners-light",
  "i-ph-lightning-light",
  "i-ph-bell-light",
];
const ICON_UI = { leadingIcon: "size-[18px]" };

const { t } = useI18n();
const appConfig = useDmsAppConfig();
const { open, collapsed } = useSidebarState();
const navigationAttribute = { [PREVIEW_NAVIGATION_ATTRIBUTE]: "" };

const breadcrumb = computed((): BreadcrumbItem[] => [
  { icon: HOME_ICON },
  { label: props.title },
]);
</script>

<template>
  <div data-dms-preview-top-bar>
    <UDashboardNavbar :toggle="false">
      <template #leading>
        <UButton
          v-bind="navigationAttribute"
          class="lg:hidden"
          :class="TOOLBAR_BUTTON_CLASS"
          color="neutral"
          variant="ghost"
          :icon="open ? 'i-ph-x' : 'i-ph-list'"
          :aria-label="
            open ? t('header.close_sidebar') : t('header.open_sidebar')
          "
          :ui="ICON_UI"
          @click="open = !open"
        />
        <UButton
          v-bind="navigationAttribute"
          class="hidden lg:flex"
          :class="TOOLBAR_BUTTON_CLASS"
          color="neutral"
          variant="ghost"
          :icon="
            collapsed
              ? appConfig.ui.icons.panelOpen
              : appConfig.ui.icons.panelClose
          "
          :aria-label="
            collapsed
              ? t('header.expand_sidebar')
              : t('header.collapse_sidebar')
          "
          :ui="ICON_UI"
          @click="collapsed = !collapsed"
        />
        <span
          aria-hidden="true"
          class="mx-1.5 hidden h-[18px] w-px bg-(--ui-border) lg:block"
        />
      </template>

      <template #title>
        <div class="pointer-events-none flex items-center" aria-hidden="true">
          <UBreadcrumb
            :items="breadcrumb"
            :ui="{ linkLabel: 'first-letter:uppercase' }"
            class="hidden md:block"
          >
            <template #separator>
              <span class="text-dimmed text-xs">/</span>
            </template>
          </UBreadcrumb>
          <MockupPageStatusBadge v-if="status" :status="status" class="ms-2" />
          <UButton
            :icon="STAR_ICON"
            variant="ghost"
            size="sm"
            color="neutral"
            :class="TOOLBAR_BUTTON_CLASS"
            tabindex="-1"
            :ui="{ leadingIcon: 'size-4' }"
          />
        </div>
      </template>

      <template #right>
        <div
          class="pointer-events-none flex items-center gap-1"
          aria-hidden="true"
        >
          <UButton
            v-for="icon in RIGHT_ICONS"
            :key="icon"
            :icon="icon"
            variant="ghost"
            color="neutral"
            :class="TOOLBAR_BUTTON_CLASS"
            tabindex="-1"
            :ui="ICON_UI"
          />
        </div>
      </template>
    </UDashboardNavbar>

    <div
      class="border-default pointer-events-none border-b px-3 py-2 sm:px-4 md:hidden"
      aria-hidden="true"
    >
      <UBreadcrumb
        :items="breadcrumb"
        :ui="{ linkLabel: 'first-letter:uppercase' }"
      >
        <template #separator>
          <span class="text-dimmed text-xs">/</span>
        </template>
      </UBreadcrumb>
    </div>
  </div>
</template>
