<script setup lang="ts">
import { Popover } from "reka-ui/namespaced";
import TableMenuRoot from "./MenuRoot.vue";
import TableMenuColumns from "./MenuColumns.vue";
import TableMenuPage from "./MenuPage.vue";
import TableMenuSort from "./MenuSort.vue";
import TableMenuFilter from "./MenuFilter.vue";
import TableMenuImport from "./MenuImport.vue";
import TableMenuViewMode from "./MenuViewMode.vue";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

const theme = tv({
  slots: {
    root: "bg-default text-default ring-default w-72 rounded-sm shadow ring-1",
    arrow: "fill-default",

    header: "border-default flex items-center gap-1 border-b px-3 py-2",
    headerIcon: "size-5 flex items-center justify-center",
    headerTitle: "text-highlighted grow text-xs",
  },
});

interface TableMenuProps {
  defaultView?: keyof typeof menuViews;
}

const props = withDefaults(defineProps<TableMenuProps>(), {
  defaultView: "root",
});

const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenu: Partial<typeof theme> };
};

const menuViews: Record<
  "root" | "filters" | "columns" | "sort" | "page" | "import" | "viewMode",
  { title: string; root?: boolean; component: Component }
> = {
  root: {
    title: t("dms.table.options_title"),
    root: true,
    component: TableMenuRoot,
  },
  filters: {
    title: t("dms.table.filters_title"),
    component: TableMenuFilter,
  },
  columns: {
    title: t("dms.table.columns_title"),
    component: TableMenuColumns,
  },
  sort: {
    title: t("dms.table.sort_title"),
    component: TableMenuSort,
  },
  page: {
    title: t("dms.table.page_size_title"),
    component: TableMenuPage,
  },
  import: {
    title: t("dms.table.import_config_title"),
    component: TableMenuImport,
  },
  viewMode: {
    title: t("dms.table.view_mode_title"),
    component: TableMenuViewMode,
  },
};

const viewState = ref<keyof typeof menuViews>(props.defaultView);

const activeView = computed(() => menuViews[viewState.value]);

const canGoBack = computed(
  () => !activeView.value.root && viewState.value !== props.defaultView,
);

const uiTableMenuVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenu || {}),
});
const uiTableMenu = computed(() => uiTableMenuVariant());
</script>

<template>
  <div :class="uiTableMenu.root()">
    <Popover.Arrow :class="uiTableMenu.arrow()" />

    <header :class="uiTableMenu.header()">
      <div :class="uiTableMenu.headerIcon()">
        <UButton
          v-if="canGoBack"
          :icon="appConfig.ui.icons.arrowLeft"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          @click="viewState = 'root'"
        />
      </div>
      <Transition
        name="fade-slide"
        mode="out-in"
        enter-active-class="transition ease-out duration-200 transform"
        enter-from-class="-translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition ease-in duration-200 transform"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
      >
        <span :key="viewState" :class="uiTableMenu.headerTitle()">
          {{ activeView.title }}
        </span>
      </Transition>
      <Popover.Close as-child>
        <UButton
          :icon="appConfig.ui.icons.close"
          variant="ghost"
          color="neutral"
          size="xs"
          square
        />
      </Popover.Close>
    </header>

    <div>
      <Component :is="activeView.component" @navigate="viewState = $event" />
    </div>
  </div>
</template>
