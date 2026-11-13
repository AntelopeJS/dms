<script setup lang="ts">
import {
  defineAsyncComponent,
  defineComponent,
  h,
  onServerPrefetch,
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

/**
 * The buttons. While the browser hydrates the server's page, they hydrate
 * only once the page has set its actions: until then the browser keeps the
 * buttons the server drew, untouched, and hydration then finds the same
 * buttons, so none of them moves. A page the browser draws itself draws them
 * at once.
 */
const Buttons = isDmsHydrating()
  ? defineAsyncComponent({
      loader: async () => ActionsBar,
      hydrate: (hydrate) => {
        if (host && !host.isReady.value) void host.whenReady().then(hydrate);
        else hydrate();
      },
    })
  : ActionsBar;
</script>

<template>
  <component :is="Buttons" />
</template>
