<script setup lang="ts">
import {
  type ModuleStoreEntry,
  type StoreAction,
  storeBlockMessage,
} from "../../../utils/module-store-catalog";
import type { StoreOperationKind } from "../../../../types/module-store";

interface ModuleManageMenuProps {
  entry: ModuleStoreEntry;
  actions: StoreAction[];
}

interface ModuleManageMenuEmits {
  action: [kind: StoreOperationKind];
}

const props = defineProps<ModuleManageMenuProps>();
const emit = defineEmits<ModuleManageMenuEmits>();
const { t } = useI18n();

const items = computed(() =>
  props.actions.map((action) => {
    const blocked = storeBlockMessage(props.entry, action.kind, t);
    return {
      label: t(`modules.store.actions.${action.labelKey}`),
      description: blocked,
      icon: action.icon,
      color: action.kind === "uninstall" ? ("error" as const) : undefined,
      disabled: blocked !== undefined,
      onSelect: () => emit("action", action.kind),
    };
  }),
);
</script>

<template>
  <UDropdownMenu
    v-if="items.length > 0"
    :items="items"
    :content="{ align: 'end' }"
    :ui="{
      content: 'max-w-72',
      itemDescription: 'whitespace-normal text-muted text-xs',
    }"
  >
    <UButton
      size="xs"
      color="neutral"
      variant="outline"
      trailing-icon="i-ph-caret-down"
      :label="t('modules.store.actions.manage')"
    />
  </UDropdownMenu>
</template>
