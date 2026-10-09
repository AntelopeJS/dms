<script setup lang="ts">
import type { NotificationCategory } from "../../../../composables/notification/useNotificationCatalog";
import {
  MATRIX_GRID_CLASS,
  MODULE_TAG_CLASS,
  SOURCE_TAG_CLASS,
} from "./notificationDisplay";

interface NotificationMatrixCategoryProps {
  category: NotificationCategory;
  /** Subjects of the category that are on, out of `total`. */
  enabledCount: number;
  /** State of the master switch: one of the subjects it can change is on. */
  on: boolean;
  total: number;
  /** Every subject is locked: the master switch has nothing to change. */
  disabled: boolean;
  /** Directly under the column header, which already draws the rule. */
  first?: boolean;
  /** The category's subjects are shown under it. */
  expanded: boolean;
  /** Id of the element holding the subjects, for `aria-controls`. */
  controls: string;
}

const props = defineProps<NotificationMatrixCategoryProps>();
const emit = defineEmits<{
  toggle: [enabled: boolean];
  "toggle-expanded": [];
}>();
const { t } = useI18n();

const label = computed(() => t(props.category.labelKey));
const countLabel = computed(() =>
  t("page.settings.notifications.category_count", {
    count: props.enabledCount,
    total: props.total,
  }),
);
const iconWellTone = computed(() =>
  props.category.tagKey ? "primary" : "muted",
);
</script>

<template>
  <div
    :class="[MATRIX_GRID_CLASS, props.first ? 'border-t-0' : 'border-t']"
    class="border-default min-h-14 bg-[color-mix(in_srgb,var(--dms-bg-muted)_55%,transparent)] py-2.5"
    role="row"
  >
    <!-- The caret folds the subjects, as in the roles editor; the title
         area does too, for the pointer. The master switch and the count stay
         on the row while it is folded. -->
    <div class="flex min-w-0 items-center gap-2" role="rowheader">
      <UButton
        :icon="props.expanded ? 'i-ph-caret-down' : 'i-ph-caret-right'"
        color="neutral"
        variant="link"
        size="xs"
        class="text-muted shrink-0 p-0"
        :aria-label="
          props.expanded
            ? t('page.settings.notifications.category_collapse', {
                name: label,
              })
            : t('page.settings.notifications.category_expand', { name: label })
        "
        :aria-expanded="props.expanded"
        :aria-controls="props.controls"
        @click="emit('toggle-expanded')"
      />
      <div
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
        data-category-title
        @click="emit('toggle-expanded')"
      >
        <DmsIconWell
          :icon="props.category.icon"
          :tone="iconWellTone"
          size="xs"
        />
        <div class="min-w-0">
          <div
            class="text-highlighted flex flex-wrap items-center gap-2 text-[13px] font-[650]"
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
          <!-- The count column goes on narrow matrices: the count moves under
               the title, where a folded group still sums itself up. -->
          <p
            class="text-dimmed mt-0.5 hidden font-mono text-[11px] font-medium @max-2xl/matrix:block"
          >
            {{ countLabel }}
          </p>
        </div>
      </div>
    </div>
    <div class="flex items-center justify-center" role="cell">
      <USwitch
        :model-value="props.on"
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
        {{ countLabel }}
      </span>
    </div>
  </div>
</template>
