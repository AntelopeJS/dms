<script setup lang="ts">
import { computed } from "vue";

/**
 * The bar at the bottom of the canvas while comments are open: how many, and
 * "Resolve with AI", which hands them all to the assistant. While the
 * assistant resolves them it reads "Resolving… ↗", and the same click leads
 * to its conversation. Once a request went unclaimed, no assistant listens
 * here, and it offers the prompt to copy.
 */
const props = defineProps<{
  count: number;
  /** No assistant claimed the last request. */
  isUnclaimed: boolean;
  /** The assistant resolves the comments now. */
  isResolving: boolean;
}>();
const emit = defineEmits<{ resolve: [] }>();

const { t } = useI18n();

const label = computed(() => {
  if (props.isResolving) return t("dms.mockup.resolve_running");
  return props.isUnclaimed
    ? t("dms.mockup.copy_prompt")
    : t("dms.mockup.resolve_ai");
});
</script>

<template>
  <div
    v-if="count > 0"
    class="border-default bg-default flex items-center gap-3 rounded-full border py-1.5 ps-4 pe-1.5 text-sm shadow-lg"
    data-dms-mockup-resolve-bar
  >
    <span class="text-default" data-dms-mockup-open-count>
      {{ t("dms.mockup.open_comments", { count }, count) }}
    </span>
    <UButton
      size="sm"
      class="rounded-full"
      :icon="isUnclaimed ? 'i-ph-copy' : 'i-ph-sparkle'"
      data-dms-mockup-resolve
      @click="emit('resolve')"
    >
      {{ label }}
    </UButton>
  </div>
</template>
