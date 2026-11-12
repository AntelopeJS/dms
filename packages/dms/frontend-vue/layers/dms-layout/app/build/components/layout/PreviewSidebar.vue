<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import {
  PREVIEW_NAVIGATION_ATTRIBUTE,
  requestPreviewPage,
} from "#dms-ui/app/entries/composables/block-preview/previewNavigation";
import type { PreviewNavigation } from "#dms-ui/app/entries/utils/blockPreview";

/**
 * The sidebar a mockup's preview draws around its blocks, as the dashboard
 * draws its own: the mockup's pages, the current one marked. Picking a page
 * tells the embedding page, which draws it. Below the dashboard's desktop
 * width it folds away behind a menu button, as the real one does.
 */
const props = defineProps<{ navigation: PreviewNavigation }>();
const open = defineModel<boolean>("open", { default: false });

const DEFAULT_ICON = "i-ph-file-light";

const items = computed((): NavigationMenuItem[] =>
  props.navigation.items.map((item) => ({
    label: item.label,
    icon: item.icon ?? DEFAULT_ICON,
    active: item.id === props.navigation.active,
    onSelect: () => {
      open.value = false;
      requestPreviewPage(item.id);
    },
  })),
);

const navigationAttribute = { [PREVIEW_NAVIGATION_ATTRIBUTE]: "" };
</script>

<template>
  <button
    v-if="open"
    v-bind="navigationAttribute"
    type="button"
    aria-hidden="true"
    tabindex="-1"
    class="bg-elevated/75 fixed inset-0 z-40 lg:hidden"
    @click="open = false"
  />
  <aside
    v-bind="navigationAttribute"
    class="border-default flex-col gap-4 border-e bg-(--dms-bg-sidebar) px-3 py-4"
    :class="
      open
        ? 'fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw] shadow-xl'
        : 'hidden w-60 shrink-0 lg:flex'
    "
  >
    <div class="flex items-center gap-2 px-2">
      <UIcon name="i-ph-diamond" class="text-highlighted size-4 shrink-0" />
      <span class="text-highlighted truncate text-sm font-semibold">
        {{ navigation.title }}
      </span>
    </div>
    <UNavigationMenu :items="items" orientation="vertical" />
  </aside>
</template>
