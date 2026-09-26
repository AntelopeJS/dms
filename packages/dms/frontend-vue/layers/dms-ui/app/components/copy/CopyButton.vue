<script setup lang="ts">
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";

// Copy-to-clipboard icon button (design .copy-btn): muted by default, turns
// success-green once the value lands on the clipboard, then reverts.
const props = defineProps<{
  value: string;
}>();

const { t } = useI18n();
const { copy, copied } = useClipboard({ copiedDuring: 1600 });

const label = computed(() =>
  t(copied.value ? "dms.button.copied" : "dms.button.copy"),
);
</script>

<template>
  <button
    type="button"
    :title="label"
    :aria-label="label"
    class="inline-grid size-[30px] place-items-center rounded-[7px] transition-colors"
    :class="
      copied
        ? 'text-success'
        : 'text-muted hover:bg-elevated hover:text-default'
    "
    @click="copy(props.value)"
  >
    <UIcon
      :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="size-4"
      :aria-hidden="true"
    />
  </button>
</template>
