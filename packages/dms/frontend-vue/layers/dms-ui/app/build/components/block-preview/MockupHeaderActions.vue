<script setup lang="ts">
import { computed } from "vue";
import { ButtonVariant } from "../../../../../dms-core/app/types/button";
import { Color } from "../../../../../dms-core/app/types/color";
import {
  isHeaderColor,
  isHeaderVariant,
} from "../../utils/blockPreviewMessages";
import type { MockupHeaderAction } from "../../utils/mockupSpec";

/**
 * The buttons right of a page's title, one row each: its label, its icon, its
 * color and its style. Emits the whole list at each change, with the key that
 * lets the history merge the typing of one field.
 */
const props = defineProps<{ actions: MockupHeaderAction[]; page: string }>();
const emit = defineEmits<{
  change: [actions: MockupHeaderAction[], coalesceKey?: string];
}>();

const UNSET = "\u0000unset";

const { t } = useI18n();

const colors = computed(() => [
  { label: t("dms.mockup.option_unset"), value: UNSET },
  ...Object.values(Color).map((value) => ({ label: value, value })),
]);
const variants = computed(() => [
  { label: t("dms.mockup.option_unset"), value: UNSET },
  ...Object.values(ButtonVariant).map((value) => ({ label: value, value })),
]);

function replaceAt(index: number, change: Partial<MockupHeaderAction>): void {
  const next = props.actions.map((action, at) =>
    at === index ? { ...action, ...change } : action,
  );
  const [field] = Object.keys(change);
  emit("change", next, `page:${props.page}:action:${index}:${field}`);
}

function setText(
  index: number,
  field: "label" | "icon",
  value: string | number,
): void {
  replaceAt(index, { [field]: String(value) });
}

function setColor(index: number, value: string): void {
  replaceAt(index, { color: isHeaderColor(value) ? value : undefined });
}

function setVariant(index: number, value: string): void {
  replaceAt(index, { variant: isHeaderVariant(value) ? value : undefined });
}

function add(): void {
  emit("change", [
    ...props.actions,
    { label: t("dms.mockup.header_action_default_label") },
  ]);
}

function remove(index: number): void {
  emit(
    "change",
    props.actions.filter((_, at) => at !== index),
  );
}
</script>

<template>
  <div class="space-y-2" data-dms-mockup-header-actions>
    <div class="text-muted block text-xs font-medium">
      {{ t("dms.mockup.header_actions") }}
    </div>
    <p class="text-dimmed text-xs">{{ t("dms.mockup.header_actions_hint") }}</p>
    <div
      v-for="(action, index) in actions"
      :key="index"
      class="border-default space-y-2 rounded-md border p-2"
      data-dms-mockup-header-action
    >
      <div class="flex items-center gap-1.5">
        <UInput
          :model-value="action.label"
          class="min-w-0 flex-1"
          :aria-label="t('dms.mockup.header_action_label')"
          :placeholder="t('dms.mockup.header_action_label')"
          data-dms-mockup-header-action-label
          @update:model-value="setText(index, 'label', $event)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-trash"
          :aria-label="t('dms.mockup.header_action_remove')"
          data-dms-mockup-header-action-remove
          @click="remove(index)"
        />
      </div>
      <UInput
        :model-value="action.icon ?? ''"
        class="w-full"
        :icon="action.icon || undefined"
        :aria-label="t('dms.mockup.header_action_icon')"
        :placeholder="t('dms.mockup.header_action_icon')"
        data-dms-mockup-header-action-icon
        @update:model-value="setText(index, 'icon', $event)"
      />
      <div class="grid grid-cols-2 gap-1.5">
        <USelect
          :model-value="action.color ?? UNSET"
          :items="colors"
          class="w-full"
          :aria-label="t('dms.mockup.header_action_color')"
          data-dms-mockup-header-action-color
          @update:model-value="setColor(index, $event)"
        />
        <USelect
          :model-value="action.variant ?? UNSET"
          :items="variants"
          class="w-full"
          :aria-label="t('dms.mockup.header_action_variant')"
          data-dms-mockup-header-action-variant
          @update:model-value="setVariant(index, $event)"
        />
      </div>
    </div>
    <UButton
      size="xs"
      color="neutral"
      variant="outline"
      icon="i-ph-plus"
      data-dms-mockup-header-action-add
      @click="add"
    >
      {{ t("dms.mockup.header_action_add") }}
    </UButton>
  </div>
</template>
