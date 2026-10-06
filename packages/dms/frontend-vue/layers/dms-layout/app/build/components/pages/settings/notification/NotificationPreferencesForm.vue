<script setup lang="ts">
import { EYEBROW_CLASS } from "#dms-ui/app/build/utils/eyebrow";
import type { NotificationCategory } from "../../../../../composables/notification/useNotificationCatalog";
import { useNotificationPreferences } from "../../../../../composables/notification/useNotificationPreferences";
import { useInstantSaveHeader } from "../../../../../composables/layout/useInstantSaveHeader";
import NotificationMatrixCategory from "./NotificationMatrixCategory.vue";
import NotificationMatrixSubject from "./NotificationMatrixSubject.vue";
import {
  MATRIX_CONTAINER_CLASS,
  MATRIX_GRID_CLASS,
} from "./notificationDisplay";

const PREFERENCES_SKELETON_ROWS = 4;

const { t } = useI18n();
const {
  categories,
  subjectsOf,
  failedChanges,
  saveState,
  isLoading,
  loadFailed,
  isEnabled,
  rowState,
  toggleableSubjectsOf,
  toggleSubject,
  toggleCategory,
  retry,
  load,
} = useNotificationPreferences();

const visibleCategories = computed(() =>
  categories.value.filter((category) => subjectsOf(category.id).length > 0),
);

const enabledCountOf = (category: NotificationCategory) =>
  subjectsOf(category.id).filter(isEnabled).length;

// The master switch reads only the subjects it can change: a locked subject
// stays on whatever the user picks, so counting it would flip the switch
// straight back on after turning the category off.
const isCategoryOn = (category: NotificationCategory) => {
  const toggleable = toggleableSubjectsOf(category);
  return toggleable.length > 0
    ? toggleable.some(isEnabled)
    : enabledCountOf(category) > 0;
};

// Each switch saves on its own: the page header carries the shared
// "Saved instantly" pill, which flashes while a row saves.
useInstantSaveHeader(() => saveState.value);

/** Names the direction the failed switch went back to, as v2 words it. */
const failureMessage = computed(() => {
  const changes = Object.values(failedChanges.value ?? {});
  if (changes.length !== 1) {
    return t("page.settings.notifications.save_failed_many");
  }
  return changes[0]
    ? t("page.settings.notifications.save_failed_off")
    : t("page.settings.notifications.save_failed_on");
});

onMounted(load);
</script>

<template>
  <DmsSection
    :title="t('page.settings.notifications.preferences_title')"
    :description="t('page.settings.notifications.preferences_description')"
  >
    <div
      :class="MATRIX_CONTAINER_CLASS"
      role="table"
      :aria-label="t('page.settings.notifications.preferences_title')"
    >
      <div
        :class="[
          MATRIX_GRID_CLASS,
          EYEBROW_CLASS,
          'border-default text-dimmed h-[34px] border-b bg-(--dms-bg-muted)',
        ]"
        role="row"
      >
        <span role="columnheader">
          {{ t("page.settings.notifications.column_subject") }}
        </span>
        <span class="text-center" role="columnheader">
          {{ t("page.settings.notifications.column_in_app") }}
        </span>
        <span
          class="flex items-center justify-center gap-1.5"
          role="columnheader"
        >
          {{ t("page.settings.notifications.column_email") }}
          <UBadge
            color="neutral"
            size="sm"
            class="tracking-[0.04em]"
            :label="t('page.settings.notifications.soon')"
          />
        </span>
        <span role="columnheader">
          <span class="sr-only">
            {{ t("page.settings.notifications.column_state") }}
          </span>
        </span>
      </div>

      <div v-if="isLoading" class="divide-y divide-(--ui-border-muted)">
        <DmsRowSkeleton
          v-for="row in PREFERENCES_SKELETON_ROWS"
          :key="row"
          class="px-[18px] py-3.5"
          well="size-[30px] rounded-lg"
          :lines="['h-3 w-40', 'h-2.5 w-64']"
          is-centered
        />
      </div>

      <DmsEmptyState
        v-else-if="loadFailed"
        variant="error"
        size="sm"
        :title="t('dms.notifications.preferences.error_loading')"
        :actions="[
          {
            label: t('page.settings.notifications.retry'),
            icon: 'i-ph-arrows-clockwise',
            color: 'neutral',
            variant: 'outline',
            onClick: load,
          },
        ]"
      />

      <template
        v-for="(category, index) in visibleCategories"
        v-else
        :key="category.id"
      >
        <NotificationMatrixCategory
          :category="category"
          :enabled-count="enabledCountOf(category)"
          :on="isCategoryOn(category)"
          :total="subjectsOf(category.id).length"
          :disabled="toggleableSubjectsOf(category).length === 0"
          :first="index === 0"
          @toggle="(enabled) => toggleCategory(category, enabled)"
        />
        <NotificationMatrixSubject
          v-for="subject in subjectsOf(category.id)"
          :key="`${category.id}:${subject.id}`"
          :subject="subject"
          :enabled="isEnabled(subject)"
          :state="rowState(subject)"
          @toggle="(enabled) => toggleSubject(subject, enabled)"
          @retry="retry"
        />
      </template>
    </div>

    <template #footer>
      <template v-if="failedChanges">
        <span class="text-error flex items-center gap-2" role="alert">
          <UIcon name="i-ph-warning-circle" class="size-3.5" />
          {{ failureMessage }}
        </span>
        <UButton
          class="ms-auto"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-ph-arrows-clockwise"
          :label="t('page.settings.notifications.retry')"
          @click="retry"
        />
      </template>
      <span v-else class="flex items-center gap-1.5 text-xs">
        <UIcon name="i-ph-info" class="text-dimmed size-3.5" />
        {{ t("page.settings.notifications.email_hint") }}
      </span>
    </template>
  </DmsSection>
</template>
