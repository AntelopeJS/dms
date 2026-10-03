<script setup lang="ts">
import { onServerPrefetch } from "vue";
import PageHeaderActionBar, {
  type LayoutHeaderAction,
} from "./PageHeaderActionBar.vue";
import { injectPageHeaderActionsHost } from "../../../composables/layout/usePageHeaderActions";

interface PageHeaderActionsOutletProps {
  /** Header buttons declared by the backend page (`headerActions`). */
  actions: LayoutHeaderAction[];
}

const props = defineProps<PageHeaderActionsOutletProps>();

const ROOT_SELECTOR = "[data-dms-page-header-actions]";
// The actions take their own full-width row below `md`, the end of the
// header row from there on.
const ROOT_CLASS =
  "flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto";

const host = injectPageHeaderActionsHost();

// The server render waits here for the page's actions (the rest of the page
// keeps rendering meanwhile), so the header's markup carries them.
onServerPrefetch(() => host?.whenReady());

const pageActions = computed(() => host?.actions.value ?? null);
const hasActions = computed(
  () => props.actions.length > 0 || !!pageActions.value,
);

// Hydrating before the page has set up: its actions are not known yet, but
// the server rendered them. The outlet keeps that markup untouched (same
// HTML, so nothing moves and hydration matches) until the page is ready,
// then renders the live actions in its place. The markup is the element's
// own, rendered by the server and read back from the page.
const serverMarkup =
  !import.meta.env.SSR && host && !host.isReady.value
    ? (document.querySelector(ROOT_SELECTOR)?.innerHTML ?? null)
    : null;
const showsServerMarkup = computed(
  () => serverMarkup !== null && !host?.isReady.value,
);
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    v-if="showsServerMarkup"
    data-dms-page-header-actions
    :class="ROOT_CLASS"
    v-html="serverMarkup"
  />
  <div
    v-else-if="hasActions && (!host || host.isReady.value)"
    data-dms-page-header-actions
    :class="ROOT_CLASS"
  >
    <PageHeaderActionBar :actions="props.actions" />
    <component :is="pageActions" v-if="pageActions" />
  </div>
</template>
