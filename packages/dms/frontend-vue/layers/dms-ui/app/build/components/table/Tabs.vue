<script setup lang="ts">
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

export interface TableTabItem {
  id: string;
  label: string;
  count?: number;
  icon?: string;
  textColor?: string;
  iconColor?: string;
}

interface Props {
  tabs: TableTabItem[];
}

const props = defineProps<Props>();
const activeId = defineModel<string>({ required: true });

const theme = tv({
  slots: {
    root: "flex flex-wrap items-center gap-1 pt-3",
    tab: "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors",
    label: "font-semibold",
    count:
      "rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-dimmed bg-elevated dark:bg-accented",
  },
  variants: {
    active: {
      true: {
        tab: "bg-primary/10 text-primary",
        count: "text-primary bg-primary/15 dark:bg-primary/15",
      },
      false: {
        tab: "text-muted hover:text-default hover:bg-elevated dark:hover:bg-accented",
      },
    },
  },
});

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableTabs: Partial<typeof theme> };
};

const uiVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableTabs || {}),
});

const ui = computed(() => uiVariant());

const onTabClick = (id: string) => {
  activeId.value = id;
};
</script>

<template>
  <nav v-if="props.tabs.length > 0" :class="ui.root()">
    <button
      v-for="tab in props.tabs"
      :key="tab.id"
      type="button"
      :class="ui.tab({ active: tab.id === activeId })"
      @click="onTabClick(tab.id)"
    >
      <UIcon
        v-if="tab.icon"
        :name="tab.icon"
        :style="
          tab.iconColor && tab.id !== activeId
            ? { color: `var(--ui-${tab.iconColor})` }
            : undefined
        "
      />
      <span
        :class="ui.label()"
        :style="
          tab.textColor && tab.id !== activeId
            ? { color: `var(--ui-${tab.textColor})` }
            : undefined
        "
      >
        {{ tab.label }}
      </span>
      <span
        v-if="tab.count !== undefined"
        :class="ui.count({ active: tab.id === activeId })"
      >
        {{ tab.count }}
      </span>
    </button>
  </nav>
</template>
