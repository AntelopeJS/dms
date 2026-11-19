<script setup lang="ts">
import type { MockupBlockType } from "../../utils/mockupCatalog";
import MockupBlockCatalog from "./MockupBlockCatalog.vue";

/**
 * The catalog in a dialog, to pick the block that replaces the one at the
 * spec's `pointer`. It is open while a pointer is set, and picking a block
 * closes it.
 */
defineProps<{ blocks: readonly MockupBlockType[] }>();
const pointer = defineModel<string>("pointer");
const emit = defineEmits<{ pick: [pointer: string, type: string] }>();

const { t } = useI18n();

function pick(type: string): void {
  const at = pointer.value;
  pointer.value = undefined;
  if (at) emit("pick", at, type);
}
</script>

<template>
  <UModal
    :open="pointer !== undefined"
    :title="t('dms.mockup.replace_title')"
    @update:open="(open: boolean) => !open && (pointer = undefined)"
  >
    <template #body>
      <MockupBlockCatalog :blocks="blocks" @pick="pick" />
    </template>
  </UModal>
</template>
