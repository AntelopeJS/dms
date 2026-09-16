<script setup lang="ts">
import type { TabProps } from "../../composables/tab/types";
import { TabVariant } from "../../composables/tab/types/props";

const { processI18n } = useTranslation();

const props = withDefaults(defineProps<TabProps>(), {
  // A tab set with nothing in it yet is a legitimate state — a page being
  // assembled, or a serialized layout that carries no items. Without a default
  // every read of `items` throws during setup and takes the page down with it.
  items: () => [],
  color: Color.primary,
  size: Size.medium,
  variant: TabVariant.pill,
  orientation: AxeOrientation.horizontal,
  unmountOnHide: true,
  persistState: false,
  stateKey: "tab",
});

const tabCount = computed(() => props.items.length);

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

const tabItems = computed(() => {
  return props.items.map((item, index) => {
    const baseItem = {
      value: String(index),
      slot: item.slot,
      icon: item.icon,
      badge: item.badge,
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
  <div class="dms-tab h-full w-full">
    <UTabs
      v-model="activeTab"
      :items="tabItems"
      :color="props.color as ColorValue"
      :size="props.size"
      :variant="props.variant"
      :orientation="props.orientation"
      :unmount-on-hide="props.unmountOnHide"
    >
      <template v-for="item in props.items" :key="item.slot" #[item.slot]>
        <div class="p-4">
          <slot :name="item.slot" />
        </div>
      </template>
    </UTabs>
  </div>
</template>
