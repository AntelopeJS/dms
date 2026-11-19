<script setup lang="ts">
import { computed } from "vue";
import { useMockupShortcutKeys } from "../../composables/block-preview/useMockupShortcutKeys";
import type { MockupShortcutId } from "../../utils/mockupShortcuts";

/**
 * A tooltip for a control of the viewer: what it does, and the keys of its
 * shortcut as badges, read from the shortcuts table, when it has one.
 */
const props = defineProps<{
  label: string;
  shortcut?: MockupShortcutId;
}>();

const { keysOf } = useMockupShortcutKeys();
const keys = computed(() => (props.shortcut ? keysOf(props.shortcut) : []));
</script>

<template>
  <UTooltip :text="label" :kbds="keys">
    <slot />
  </UTooltip>
</template>
