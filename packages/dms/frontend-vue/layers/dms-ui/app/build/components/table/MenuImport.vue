<script setup lang="ts">
import { themeOverride } from "./tableComponentTheme";
import { tv } from "tailwind-variants";
import { useTableConfigClipboard } from "../../composables/table/useTableConfigClipboard";

export interface MenuImportEmits {
  (e: "navigate", view: string): void;
}

const theme = tv({
  slots: {
    root: "divide-default divide-y",
    form: "flex flex-col gap-2 px-3 py-2",
    textarea: "w-full",
    actions: "text-default px-1.5 py-1",
    actionButton: "justify-start",
  },
});

const emits = defineEmits<MenuImportEmits>();
const { t } = useI18n();

const { importConfig } = useTableConfigClipboard();

const code = ref("");

const applyImport = () => {
  if (!code.value.trim()) return;
  const success = importConfig(code.value);
  if (success) emits("navigate", "root");
};

const uiTableMenuImportVariant = tv({
  extend: tv(theme),
  ...themeOverride("tableMenuImport"),
});
const uiTableMenuImport = computed(() => uiTableMenuImportVariant());
</script>

<template>
  <div :class="uiTableMenuImport.root()">
    <div :class="uiTableMenuImport.form()">
      <UTextarea
        v-model="code"
        :class="uiTableMenuImport.textarea()"
        :placeholder="t('dms.table.import_config_placeholder')"
        :rows="5"
        autofocus
      />
    </div>

    <div :class="uiTableMenuImport.actions()">
      <UButton
        icon="i-ph-check"
        :ui="{ base: uiTableMenuImport.actionButton() }"
        :label="t('dms.table.import_config_apply')"
        :disabled="!code.trim()"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        @click="applyImport"
      />
    </div>
  </div>
</template>
