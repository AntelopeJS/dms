<script setup lang="ts">
import { onServerPrefetch } from "vue";
import PageHeaderActionBar, {
  type LayoutHeaderAction,
} from "./PageHeaderActionBar.vue";
import { injectPageHeaderActionsHost } from "../../../composables/layout/usePageHeaderActions";
import { useServedHeaderActions } from "../../../composables/layout/useServedHeaderActions";

interface PageHeaderActionsOutletProps {
  /** Header buttons declared by the backend page (`headerActions`). */
  actions: LayoutHeaderAction[];
  /** The page query the server resolved their availability for. */
  servedQuery?: Record<string, string>;
  /** The route parameters the server resolved their availability for. */
  servedParams?: Record<string, string>;
}

const props = withDefaults(defineProps<PageHeaderActionsOutletProps>(), {
  servedQuery: undefined,
  servedParams: undefined,
});

const actions = useServedHeaderActions({
  actions: () => props.actions,
  servedQuery: () => props.servedQuery,
  servedParams: () => props.servedParams,
});

const ROOT_SELECTOR = "[data-dms-page-header-actions]";

const ROOT_CLASS =
  "flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto";

const host = injectPageHeaderActionsHost();

onServerPrefetch(() => host?.whenReady());

const pageActions = computed(() => host?.actions.value ?? null);
const hasActions = computed(
  () => actions.value.length > 0 || !!pageActions.value,
);

/**
 * This outlet's own server-rendered DOM HTML, read back during hydration
 * before the page has registered its actions. Reused by `v-html` only until
 * the host is ready so hydration matches without moving the buttons. This
 * is not an input for arbitrary HTML supplied by a caller.
 */
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
    <PageHeaderActionBar
      :actions="actions"
      :slot-order="host?.actionsOrder.value"
    >
      <component :is="pageActions" v-if="pageActions" />
    </PageHeaderActionBar>
  </div>
</template>
