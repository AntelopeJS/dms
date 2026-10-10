<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

// A value in the mono font (an id, a key, a slug), with a button copying it
// that shows on hover. The root is a block flex box held to its cell's
// width: an inline one grows with the value, which then never truncates.

interface Props {
  value: string;
  /** Draws the copy button. */
  copy?: boolean;
}

const props = defineProps<Props>();

const { t } = useI18n();
const toast = useToast();
const { copy: copyToClipboard } = useClipboard({ legacy: true });

const copyValue = async () => {
  await copyToClipboard(props.value);
  toast.add({
    title: t("dms.table.cell.copied"),
    color: Color.success,
    icon: "i-ph-check",
  });
};
</script>

<template>
  <span class="group/mono flex max-w-full min-w-0 items-center gap-1">
    <span class="text-toned truncate font-mono" :title="props.value">
      {{ props.value }}
    </span>
    <UButton
      v-if="props.copy"
      icon="i-ph-copy"
      color="neutral"
      variant="ghost"
      size="xs"
      square
      :aria-label="t('dms.table.cell.copy')"
      class="text-dimmed shrink-0 opacity-0 transition-opacity group-hover/mono:opacity-100 focus-visible:opacity-100"
      @click.stop="copyValue"
      @dblclick.stop
    />
  </span>
</template>
