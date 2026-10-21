<script setup lang="ts">
import type { TabProps } from "../../composables/tab/types";
import { type TabBadges, TabVariant } from "../../composables/tab/types/props";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { confirmLeave } from "../../build/composables/unsaved-changes/registry";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { BadgeProps } from "@nuxt/ui";

const { processI18n } = useTranslation();
const { processText } = useComposedText();

const props = withDefaults(defineProps<TabProps>(), {
  // A tab set with nothing in it yet is a legitimate state — a page being
  // assembled, or a serialized layout that carries no items. Without a default
  // every read of `items` throws during setup and takes the page down with it.
  items: () => [],
  // Neutral pill for in-content switches; page-level navigation passes primary.
  color: Color.neutral,
  size: Size.medium,
  variant: TabVariant.pill,
  orientation: AxeOrientation.horizontal,
  unmountOnHide: true,
  persistState: false,
  stateKey: "tab",
  badgesUrl: undefined,
  realtimeTopic: undefined,
  fit: false,
});

// The badges a module counts for a record's tabs, in one request, again when
// a watch action or a realtime topic fires: each replaces its tab's static
// badge.
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);
const { data: fetchedBadges } = useChartFetch<TabBadges>({
  fetchUrl: props.badgesUrl,
  realtimeTopic: props.realtimeTopic,
  routeParams: () => props.routeParams,
  watchSource: () => JSON.stringify(watchState.value),
});
const { locale } = useI18n();
const countFormat = computed(() => new Intl.NumberFormat(locale.value));

// Shown like a table view's tab counts: a mono counter, tinted on the
// active tab.
const COUNT_BADGE_CLASS =
  "rounded-[4px] bg-elevated px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums text-dimmed ring-0 in-data-[state=active]:bg-primary/10 in-data-[state=active]:text-primary";

type TabBadge = TabProps["items"][number]["badge"];

// A badge written as text is a BlockText: a `$` key or a ComposedText is
// written in the reader's language, a number as it is.
function writtenBadge(
  badge: TabBadge,
): string | number | BadgeProps | undefined {
  if (badge === undefined || typeof badge === "number") return badge;
  if (typeof badge === "string" || "key" in badge) return processText(badge);
  const { label } = badge;
  return typeof label === "string"
    ? { ...badge, label: processText(label) }
    : badge;
}

function badgeOf(item: TabProps["items"][number]) {
  const fetched = fetchedBadges.value?.[item.slot];
  if (fetched === undefined) return writtenBadge(item.badge);
  return typeof fetched === "number"
    ? countFormat.value.format(fetched)
    : fetched;
}

const tabCount = computed(() => props.items.length);

// The panel lines up with the list: below it, or beside a vertical one. A
// phone has no room for a 192px column beside the panel: the vertical list
// goes on top, full width.
const PANEL_CLASSES: Record<AxeOrientation, string> = {
  [AxeOrientation.horizontal]: "pt-4",
  [AxeOrientation.vertical]: "pl-5 max-sm:pt-4 max-sm:pl-0",
};

const LIST_CLASSES: Record<AxeOrientation, string> = {
  [AxeOrientation.horizontal]: "",
  [AxeOrientation.vertical]: "w-48 shrink-0 max-sm:w-full",
};

const ROOT_CLASSES: Record<AxeOrientation, string> = {
  [AxeOrientation.horizontal]: "",
  [AxeOrientation.vertical]: "max-sm:flex-col max-sm:items-stretch",
};

// A fitted pill list hugs its tabs: the triggers stop growing to share the
// full width. Link tabs never grow, and a vertical list has its own width.
const FIT_CLASSES: Record<TabVariant, { list: string; trigger: string }> = {
  [TabVariant.pill]: { list: "w-fit max-w-full", trigger: "grow-0" },
  [TabVariant.link]: { list: "", trigger: "" },
};

const panelClass = computed(() => PANEL_CLASSES[props.orientation]);
const fitClasses = computed(() =>
  props.fit && props.orientation === AxeOrientation.horizontal
    ? FIT_CLASSES[props.variant]
    : undefined,
);
const tabsUi = computed(() => ({
  root: ROOT_CLASSES[props.orientation],
  list: [LIST_CLASSES[props.orientation], fitClasses.value?.list],
  trigger: fitClasses.value?.trigger,
  // The panel may shrink below its content's width (a wide table scrolls
  // inside it instead of pushing the page sideways).
  content: "min-w-0",
  trailingBadge: props.badgesUrl ? COUNT_BADGE_CLASS : undefined,
}));

const {
  activeTab,
  nextTab,
  previousTab,
  goToTab,
  goToFirstTab,
  goToLastTab,
  resetTabs,
} = useTab(tabCount, props);

useTabShortcuts({ items: props.items, goToTab });

// A hidden panel is unmounted (unless asked otherwise): a form in it holding
// unsaved changes would lose them, so switching away asks first.
const root = useTemplateRef<HTMLElement>("root");

async function selectTab(value: string | number): Promise<void> {
  const next = String(value);
  if (next === activeTab.value) return;
  if (props.unmountOnHide) {
    const panel = root.value?.querySelector('[role="tabpanel"]');
    if (panel && !(await confirmLeave({ within: panel }))) return;
  }
  activeTab.value = next;
}

const tabItems = computed(() => {
  return props.items.map((item, index) => {
    const baseItem = {
      value: String(index),
      slot: item.slot,
      icon: item.icon,
      badge: badgeOf(item),
      disabled: item.disabled,
      avatar: item.avatar,
    };

    return {
      label: processI18n(item.label || "Tab " + (index + 1)),
      ...baseItem,
    };
  });
});

defineExpose({
  nextTab,
  previousTab,
  goToTab,
  goToFirstTab,
  goToLastTab,
  resetTabs,
  activeTab,
});
</script>

<template>
  <div ref="root" class="dms-tab h-full w-full">
    <UTabs
      :model-value="activeTab"
      :items="tabItems"
      :color="props.color as ColorValue"
      :size="props.size"
      :variant="props.variant"
      :orientation="props.orientation"
      :unmount-on-hide="props.unmountOnHide"
      :ui="tabsUi"
      @update:model-value="selectTab"
    >
      <template v-for="item in props.items" :key="item.slot" #[item.slot]>
        <div class="space-y-6" :class="panelClass">
          <slot :name="item.slot" />
        </div>
      </template>
    </UTabs>
  </div>
</template>
