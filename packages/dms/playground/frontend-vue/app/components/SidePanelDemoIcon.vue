<script setup lang="ts">
/**
 * Icon of the side panel demo's header action, drawn in place of its `icon`
 * (see `HeaderAction.iconComponent`). It follows the panel's open state, which
 * the header's plain icon string cannot.
 */
import { useSidePanelDemo } from "../composables/useSidePanelDemo";

const { isOpen } = useSidePanelDemo();
</script>

<template>
  <UIcon
    :name="isOpen ? 'i-ph-sidebar-simple-fill' : 'i-ph-sidebar-simple-light'"
    class="size-full transition-transform duration-200 motion-reduce:transition-none"
    :class="isOpen ? 'scale-110' : undefined"
  />
</template>
