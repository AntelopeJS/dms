<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { ClientPoint } from "../../composables/block-preview/useMockupPins";

/**
 * The name of the block armed from the catalog, a small chip that follows the
 * pointer. It is drawn at the screen's coordinates, outside the shrunk frame,
 * and shows once the pointer has moved.
 */
defineProps<{ name: string }>();

const OFFSET_PX = 14;

const point = ref<ClientPoint>();

function follow(event: PointerEvent): void {
  point.value = { x: event.clientX, y: event.clientY };
}

onMounted(() => window.addEventListener("pointermove", follow));
onBeforeUnmount(() => window.removeEventListener("pointermove", follow));
</script>

<template>
  <span
    v-if="point"
    class="bg-primary text-inverted pointer-events-none fixed z-50 rounded-md px-2 py-0.5 text-xs font-medium shadow-md"
    :style="{
      left: `${point.x + OFFSET_PX}px`,
      top: `${point.y + OFFSET_PX}px`,
    }"
    data-dms-mockup-placing-chip
  >
    {{ name }}
  </span>
</template>
