<script setup lang="ts">
import type { MockupBlockType } from "../../utils/mockupCatalog";
import MockupBlockCatalog from "./MockupBlockCatalog.vue";

defineProps<{ blocks: readonly MockupBlockType[] }>();
/** The spec's `pointer` of the block to replace: the dialog is open while it is set, and picking a block closes it. */
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
