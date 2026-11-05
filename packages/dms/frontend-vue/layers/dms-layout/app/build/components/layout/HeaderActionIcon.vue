<script setup lang="ts">
import {
  getCurrentInstance,
  onErrorCaptured,
  onMounted,
  ref,
  watch,
  type Component,
  type ComponentInternalInstance,
} from "vue";

/**
 * Draws a header action's `iconComponent` in the leading slot of its button.
 * `icon` stands in, at the size of the button's own leading icon, while there
 * is no component, on the server and the hydration pass, until the component
 * has rendered, and when it fails to load. A new `component` gets its own
 * attempt after a failed one.
 */
const props = defineProps<{
  component?: Component;
  icon: string;
}>();

/** The box of the `leadingIcon` this replaces, whichever of the two draws. */
const ICON_CLASS = "size-[18px] shrink-0";

const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const failed = ref(false);
watch(
  () => props.component,
  () => {
    failed.value = false;
  },
);
const self = getCurrentInstance();

/** The component drawn here that `source` belongs to: its ancestor whose parent is this one. */
function drawnComponentOf(
  source: ComponentInternalInstance | null,
): ComponentInternalInstance | null {
  let current = source;
  while (current && current.parent !== self) current = current.parent;
  return current;
}

onErrorCaptured((error, instance) => {
  if (drawnComponentOf(instance?.$ ?? null)?.type !== props.component)
    return false;
  failed.value = true;
  if (import.meta.env.DEV)
    console.warn(
      "[dms] header action icon component failed to load; drawing icon instead",
      error,
    );
  return false;
});
</script>

<template>
  <UIcon
    v-if="!mounted || failed || !component"
    :name="icon"
    :class="ICON_CLASS"
  />
  <Suspense v-else>
    <component :is="component" :class="ICON_CLASS" />
    <template #fallback>
      <UIcon :name="icon" :class="ICON_CLASS" />
    </template>
  </Suspense>
</template>
