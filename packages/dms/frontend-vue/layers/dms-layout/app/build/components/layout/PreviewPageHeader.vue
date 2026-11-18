<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import { PREVIEW_HEADER_ATTRIBUTE } from "#dms-ui/app/entries/composables/block-preview/previewNavigation";
import type { PreviewHeader } from "#dms-ui/app/entries/utils/blockPreview";
import PageHeader from "./PageHeader.vue";
import { headerButtonProps } from "./headerButton";

/**
 * The page header a mockup draws above its blocks: the dashboard's own
 * `PageHeader`, fed by the spec page's fields instead of the page's layout,
 * with its buttons drawn as the page header bar draws them and none of what
 * they would do. Clicking it while inspecting picks the page.
 */
const props = defineProps<{ header: PreviewHeader }>();

const DEFAULT_ICON = "i-ph-file";
const ACTIONS_CLASS = "flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto";

const marker = { [PREVIEW_HEADER_ATTRIBUTE]: "" };

const actions = computed(() =>
  (props.header.actions ?? []).map(
    (action): ButtonProps => ({
      ...headerButtonProps(action),
      label: action.label,
    }),
  ),
);
</script>

<template>
  <PageHeader
    v-bind="marker"
    class="pb-6"
    :icon="header.icon || DEFAULT_ICON"
    :title="header.title"
    :description="header.description"
  >
    <template #actions>
      <div v-if="actions.length" :class="ACTIONS_CLASS">
        <UButton v-for="(button, index) in actions" :key="index" v-bind="button" />
      </div>
    </template>
  </PageHeader>
</template>
