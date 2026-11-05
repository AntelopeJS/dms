<script setup lang="ts">
import { onErrorCaptured, ref, type Component } from "vue";

/**
 * Draws a header action's `iconComponent` in the leading slot of its button.
 * `icon` stands in, at the size of the button's own leading icon, until the
 * component has rendered, and stays when it fails to load.
 */
defineProps<{
  component: Component;
  icon: string;
}>();

/** The box of the `leadingIcon` this replaces, whichever of the two draws. */
const ICON_CLASS = "size-[18px] shrink-0";

const failed = ref(false);
onErrorCaptured(() => {
  failed.value = true;
  return false;
});
</script>

<template>
  <UIcon v-if="failed" :name="icon" :class="ICON_CLASS" />
  <Suspense v-else>
    <component :is="component" :class="ICON_CLASS" />
    <template #fallback>
      <UIcon :name="icon" :class="ICON_CLASS" />
    </template>
  </Suspense>
</template>
