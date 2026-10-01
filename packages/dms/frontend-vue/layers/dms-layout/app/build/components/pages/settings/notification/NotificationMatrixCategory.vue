<script setup lang="ts">
import type { NotificationCategory } from "../../../../../composables/notification/useNotificationCatalog";
import {
  MATRIX_GRID_CLASS,
  MODULE_TAG_CLASS,
  SOURCE_TAG_CLASS,
} from "./notificationDisplay";

interface NotificationMatrixCategoryProps {
  category: NotificationCategory;
  /** Subjects of the category that are on, out of `total`. */
  enabledCount: number;
  total: number;
  /** Every subject is locked: the master switch has nothing to change. */
  disabled: boolean;
  /** Directly under the column header, which already draws the rule. */
  first?: boolean;
}

const props = defineProps<NotificationMatrixCategoryProps>();
const emit = defineEmits<{ toggle: [enabled: boolean] }>();
const { t } = useI18n();

const label = computed(() => t(props.category.labelKey));
const iconWellTone = computed(() =>
  props.category.tagKey ? "accent" : "muted",
);
</script>

<template>
  <div
    :class="[MATRIX_GRID_CLASS, props.first ? 'border-t-0' : 'border-t']"
    class="border-default min-h-14 bg-[color-mix(in_srgb,var(--dms-bg-muted)_55%,transparent)] py-2.5"
    role="row"
  >
    <div class="flex min-w-0 items-center gap-3" role="rowheader">
      <DmsIconWell :icon="props.category.icon" :tone="iconWellTone" size="xs" />
      <div class="min-w-0">
        <div
          class="text-highlighted flex items-center gap-2 text-[13px] font-[650]"
        >
          {{ label }}
          <span
            v-if="props.category.tagKey"
            :class="[SOURCE_TAG_CLASS, MODULE_TAG_CLASS]"
          >
            {{ t(props.category.tagKey) }}
          </span>
        </div>
        <p
          v-if="props.category.descriptionKey"
          class="text-muted mt-px text-xs"
        >
          {{ t(props.category.descriptionKey) }}
        </p>
      </div>
    </div>
    <div class="flex items-center justify-center" role="cell">
      <USwitch
        :model-value="props.enabledCount > 0"
        :disabled="props.disabled"
        :aria-label="
          t('page.settings.notifications.category_switch', { name: label })
        "
        @update:model-value="(value: boolean) => emit('toggle', value)"
      />
    </div>
    <div
      class="text-dimmed flex justify-center font-mono text-xs font-medium"
      role="cell"
    >
      —
    </div>
    <div class="flex justify-end" role="cell">
      <span class="text-dimmed font-mono text-[11px] font-medium">
        {{
          t("page.settings.notifications.category_count", {
            count: props.enabledCount,
            total: props.total,
          })
        }}
      </span>
    </div>
  </div>
</template>
