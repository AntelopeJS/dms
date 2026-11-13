<script setup lang="ts">
import {
  defineAsyncComponent,
  defineComponent,
  h,
  onMounted,
  onServerPrefetch,
  shallowRef,
  type Component,
  type HydrationStrategy,
} from "vue";
import PageHeaderActionBar, {
  type LayoutHeaderAction,
} from "./PageHeaderActionBar.vue";
import { injectPageHeaderActionsHost } from "#dms-ui/app/composables/layout/usePageHeaderActions";
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

const ROOT_CLASS =
  "flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto";

const host = injectPageHeaderActionsHost();

onServerPrefetch(() => host?.whenReady());

const pageActions = computed(() => host?.actions.value ?? null);
const hasActions = computed(
  () => actions.value.length > 0 || !!pageActions.value,
);

/** The header's buttons, drawn once the page in the slot has set its actions. */
const ActionsBar = defineComponent({
  name: "DmsPageHeaderActions",
  setup: () => () =>
    hasActions.value && (!host || host.isReady.value)
      ? h(
          "div",
          { "data-dms-page-header-actions": "", class: ROOT_CLASS },
          h(
            PageHeaderActionBar,
            { actions: actions.value, slotOrder: host?.actionsOrder.value },
            {
              default: () => (pageActions.value ? h(pageActions.value) : null),
            },
          ),
        )
      : null,
});

/** Never hydrates, so the server's DOM stays as drawn until it is replaced. */
const neverHydrate: HydrationStrategy = () => undefined;

/**
 * The buttons. While the browser hydrates the server's page, it keeps the
 * buttons the server drew, untouched, until the page in the slot has set its
 * actions, then draws its own buttons in their place: they show the
 * browser's actions, attributes included, never the server's. A page the
 * browser draws itself draws them at once.
 */
const Buttons = shallowRef<Component>(
  isDmsHydrating()
    ? defineAsyncComponent({
        loader: async () => ActionsBar,
        hydrate: neverHydrate,
      })
    : ActionsBar,
);

onMounted(async () => {
  await host?.whenReady();
  Buttons.value = ActionsBar;
});
</script>

<template>
  <component :is="Buttons" />
</template>
