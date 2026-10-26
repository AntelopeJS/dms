<script setup lang="ts">
import { defineComponent } from "vue";
import PageHeader from "./PageHeader.vue";
import PageHeaderActionsOutlet from "./PageHeaderActionsOutlet.vue";
import PageSkeleton from "./PageSkeleton.vue";
import type { LayoutHeaderAction } from "./PageHeaderActionBar.vue";
import { providePageHeaderActions } from "#dms-ui/app/composables/layout/usePageHeaderActions";

interface Props {
  hideHeader?: boolean;
  icon?: string;
  title?: string;
  description?: string;
  /** Header buttons declared by the backend page (`headerActions`). */
  headerActions?: LayoutHeaderAction[];
  /**
   * The page query the server served the buttons for, set when one declares
   * an `availability` or the page reads a `record` (`headerActionsQuery`).
   */
  headerActionsQuery?: Record<string, string>;
  /** The route parameters (`:id`) they were resolved for, likewise. */
  headerActionsParams?: Record<string, string>;
  /** Space between the page header and the page. */
  headerClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  hideHeader: false,
  icon: "i-ph-file",
  title: undefined,
  description: undefined,
  headerActions: () => [],
  headerActionsQuery: undefined,
  headerActionsParams: undefined,
  headerClass: "pb-6",
});

const pageHeaderActions = providePageHeaderActions();
const PageRendered = defineComponent({
  name: "DmsPageRendered",
  setup() {
    pageHeaderActions.markSlotRendered();
    return () => null;
  },
});

const isPageLoading = useDmsPageLoading();

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
      <PageHeaderActionsOutlet
        :actions="props.headerActions"
        :served-query="props.headerActionsQuery"
        :served-params="props.headerActionsParams"
      />
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
