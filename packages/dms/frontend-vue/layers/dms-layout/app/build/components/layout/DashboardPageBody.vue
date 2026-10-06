<script setup lang="ts">
import { defineComponent } from "vue";
import PageHeader from "./PageHeader.vue";
import PageHeaderActionsOutlet from "./PageHeaderActionsOutlet.vue";
import PageSkeleton from "./PageSkeleton.vue";
import type { LayoutHeaderAction } from "./PageHeaderActionBar.vue";
import { providePageHeaderActions } from "../../../composables/layout/usePageHeaderActions";

interface Props {
  hideHeader?: boolean;
  icon?: string;
  title?: string;
  description?: string;
  /** Header buttons declared by the backend page (`headerActions`). */
  headerActions?: LayoutHeaderAction[];
  /** Space between the page header and the page. */
  headerClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  hideHeader: false,
  icon: "i-ph-file",
  title: undefined,
  description: undefined,
  headerActions: () => [],
  headerClass: "pb-6",
});

// The header renders before the page in the slot: its actions come through
// an outlet that waits for the page's setup (see usePageHeaderActions), and
// a marker after the slot says the page has rendered.
const pageHeaderActions = providePageHeaderActions();
const PageRendered = defineComponent({
  name: "DmsPageRendered",
  setup() {
    pageHeaderActions.markSlotRendered();
    return () => null;
  },
});

// After a client navigation the skeleton stands in for the page until its
// chunk (and its setup) resolves, so the old page is never kept on screen.
const isPageLoading = useDmsPageLoading();
// A reloaded "preview as role" tab holds its page back (pre-paint script, see
// the permission-preview-prepaint plugin) until the preview veils it.
const PAGE_SKELETON_CLASS =
  "hidden [html[data-dms-role-preview=pending]_&]:block";
const PAGE_SLOT_CLASS =
  "contents [html[data-dms-role-preview=pending]_&]:hidden";
</script>

<template>
  <PageHeader
    v-if="props.title && !props.hideHeader"
    :icon="props.icon || 'i-ph-file'"
    :title="props.title"
    :description="props.description"
    :class="props.headerClass"
  >
    <template #actions>
      <PageHeaderActionsOutlet :actions="props.headerActions" />
    </template>
  </PageHeader>
  <div :class="isPageLoading ? 'hidden' : PAGE_SLOT_CLASS">
    <slot />
  </div>
  <PageSkeleton
    :with-title="!props.title || props.hideHeader"
    :class="isPageLoading ? undefined : PAGE_SKELETON_CLASS"
  />
  <PageRendered />
</template>
