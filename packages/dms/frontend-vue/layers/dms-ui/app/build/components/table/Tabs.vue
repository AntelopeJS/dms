<script setup lang="ts">
import { onMounted, ref, resolveComponent, useTemplateRef } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

export interface TableTabItem {
  id: string;
  label: string;
  count?: number;
  icon?: string;
  textColor?: string;
  iconColor?: string;
  /** Link tab: the page it opens; never the active tab. */
  to?: string;
  /**
   * "Preview as role" only: the previewed role could not open the linked
   * page, so the tab is drawn hatched and locked.
   */
  previewLocked?: boolean;
  /**
   * "Preview as role" only: the previewed role opens the linked page without
   * some of its blocks or actions, so the tab is drawn with the orange hatch
   * and lock. Ignored on a locked tab.
   */
  previewPartial?: boolean;
}

interface Props {
  tabs: TableTabItem[];
  /**
   * Drawn inside the table's header band (no caption): no rule or gutter of
   * its own, full band height, the underline on the band's bottom rule.
   */
  inline?: boolean;
  /** Accessible name of the tab strip. */
  label?: string;
}

const props = defineProps<Props>();
const activeId = defineModel<string>({ required: true });

// v2 link tabs: a 2px accent underline sits on the row's bottom rule.
const theme = tv({
  slots: {
    root: "no-scrollbar flex gap-5 overflow-x-auto border-b border-default px-[18px]",
    tab: "relative inline-flex h-[38px] shrink-0 items-center gap-1.5 px-0.5 text-[13px] transition-colors [&>svg]:size-3.5",
    label: "",
    count:
      "rounded-[4px] bg-elevated px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums text-dimmed",
  },
  variants: {
    active: {
      true: {
        tab: "font-semibold text-highlighted after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-t-[2px] after:bg-primary",
        count: "bg-primary/10 text-primary",
      },
      false: {
        tab: "font-medium text-muted hover:text-highlighted",
      },
    },
    inline: {
      true: {
        root: "me-auto max-w-full shrink-0 self-stretch border-b-0 px-0",
        tab: "h-11",
      },
    },
    // Same hatch as the sidebar's locked entries.
    previewLocked: {
      true: {
        tab: "px-1.5 text-muted bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-error)_9%,transparent)_0_6px,transparent_6px_12px)]",
      },
    },
    // Same hatch as the sidebar's partially locked entries.
    previewPartial: {
      true: {
        tab: "px-1.5 bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-warning)_12%,transparent)_0_6px,transparent_6px_12px)]",
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

const ui = computed(() => uiVariant({ inline: props.inline }));

const DmsLink = resolveComponent("DmsLink");

const isActive = (tab: TableTabItem): boolean =>
  !tab.to && tab.id === activeId.value;

// Beside link tabs, the active tab stands for the page itself.
const currentValue = computed(() =>
  props.tabs.some((tab) => tab.to) ? "page" : "true",
);

const onTabClick = (tab: TableTabItem) => {
  if (tab.to) return;
  activeId.value = tab.id;
};

// A strip wider than the card scrolls sideways: its clipped edges fade out so
// the hidden tabs read as reachable.
const FADE_EDGE = "24px";
const navRef = useTemplateRef<HTMLElement>("nav");
const fadeStart = ref(false);
const fadeEnd = ref(false);
const syncFades = () => {
  const nav = navRef.value;
  if (!nav) return;
  fadeStart.value = nav.scrollLeft > 1;
  fadeEnd.value = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
};
useResizeObserver(navRef, syncFades);
onMounted(syncFades);
const fadeStyle = computed(() => {
  if (!fadeStart.value && !fadeEnd.value) return undefined;
  const start = fadeStart.value ? "transparent" : "#000";
  const end = fadeEnd.value ? "transparent" : "#000";
  return {
    maskImage: `linear-gradient(to right, ${start}, #000 ${FADE_EDGE}, #000 calc(100% - ${FADE_EDGE}), ${end})`,
  };
});

const { locale } = useI18n();
const countFormat = computed(() => new Intl.NumberFormat(locale.value));
</script>

<template>
  <nav
    v-if="props.tabs.length > 0"
    ref="nav"
    :class="ui.root()"
    :style="fadeStyle"
    :aria-label="props.label"
    @scroll.passive="syncFades"
  >
    <component
      :is="tab.to ? DmsLink : 'button'"
      v-for="tab in props.tabs"
      :key="tab.id"
      v-bind="tab.to ? { to: tab.to } : { type: 'button' }"
      :class="
        ui.tab({
          active: isActive(tab),
          previewLocked: !!tab.previewLocked,
          previewPartial: !tab.previewLocked && !!tab.previewPartial,
        })
      "
      :aria-current="isActive(tab) ? currentValue : undefined"
      @click="onTabClick(tab)"
    >
      <UIcon
        v-if="tab.icon"
        :name="tab.icon"
        :style="
          tab.iconColor && !isActive(tab)
            ? { color: `var(--ui-${tab.iconColor})` }
            : undefined
        "
      />
      <span
        :class="ui.label()"
        :style="
          tab.textColor && !isActive(tab)
            ? { color: `var(--ui-${tab.textColor})` }
            : undefined
        "
      >
        {{ tab.label }}
      </span>
      <span
        v-if="tab.count !== undefined"
        :class="ui.count({ active: isActive(tab) })"
      >
        {{ countFormat.format(tab.count) }}
      </span>
      <UIcon
        v-if="tab.previewLocked"
        name="i-ph-lock-simple"
        class="text-error"
      />
      <UIcon
        v-else-if="tab.previewPartial"
        name="i-ph-lock-simple"
        class="text-warning"
      />
    </component>
  </nav>
</template>
