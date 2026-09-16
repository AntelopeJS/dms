<script setup lang="ts">
import NotificationCard from "../../../notification/NotificationCard.vue";

type NotificationSubject = {
  id: string;
  category: NotificationCategory;
  labelKey: string;
  descriptionKey?: string;
  togglePermission?: TogglePermission;
};

type NotificationCategory = {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  togglePermission?: TogglePermission;
};

type TogglePermission = "allowed" | "forbidden" | "default";

const { $authFetch } = useAuthFetch();
const categories = ref<NotificationCategory[]>([]);
const subjects = ref<NotificationSubject[]>([]);
const preferences = ref<Record<string, boolean>>({});
const expandedCategories = ref<Set<string>>(new Set());
const isLoading = ref(true);
const isSaving = ref(false);
const toast = useToast();
const { t } = useI18n();

const canToggle = (data: NotificationSubject | NotificationCategory) => {
  const parentToggle =
    "category" in data
      ? (data as NotificationSubject).category.togglePermission
      : undefined;

  if (parentToggle === "default") {
    return data.togglePermission !== "forbidden";
  }

  return parentToggle !== "forbidden" || data.togglePermission !== "forbidden";
};

const toggleCategoryExpand = (categoryId: string) => {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId);
  } else {
    expandedCategories.value.add(categoryId);
  }
};

const isCategoryExpanded = (categoryId: string) =>
  expandedCategories.value.has(categoryId);

const buildPreferenceKey = (categoryId: string, subjectId: string): string => {
  return `${categoryId}:${subjectId}`;
};

const fetchCategories = async () => {
  const response = await $authFetch<{
    categories: NotificationCategory[];
    subjects: NotificationSubject[];
  }>("/settings/user/notifications/categories");

  categories.value = response.categories;
  subjects.value = response.subjects;
};

const fetchPreferences = async () => {
  try {
    preferences.value = await $authFetch<Record<string, boolean>>(
      "/settings/user/notifications/preferences",
    );
  } catch {
    toast.add({
      title: t("dms.notifications.preferences.error_loading"),
      color: "error",
    });
  }
};

const savePreferences = async () => {
  isSaving.value = true;
  try {
    await $authFetch("/settings/user/notifications/preferences", {
      method: "PUT",
      body: preferences.value,
    });

    toast.add({
      title: t("dms.notifications.preferences.success"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("dms.notifications.preferences.error_saving"),
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
};

const isCategoryFullyEnabled = (category: NotificationCategory): boolean => {
  const categorySubjects = subjects.value.filter(
    (subject) => subject.category.id === category.id,
  );
  return categorySubjects.every((subject) => {
    const key = buildPreferenceKey(category.id, subject.id);
    return preferences.value[key] ?? true;
  });
};

const toggleCategory = (category: NotificationCategory, newValue: boolean) => {
  const categorySubjects = subjects.value.filter(
    (subject) => subject.category.id === category.id,
  );
  for (const subject of categorySubjects) {
    if (canToggle(subject) || newValue) {
      const key = buildPreferenceKey(category.id, subject.id);
      preferences.value[key] = newValue;
    }
  }
  savePreferences();
};

const toggleSubject = (
  categoryId: string,
  subjectId: string,
  newValue: boolean,
) => {
  const key = buildPreferenceKey(categoryId, subjectId);
  preferences.value[key] = newValue;
  savePreferences();
};

onMounted(async () => {
  try {
    await Promise.all([fetchCategories(), fetchPreferences()]);
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div v-if="!isLoading" class="space-y-2">
    <div v-for="category in categories" :key="category.id">
      <NotificationCard
        mode="list-top"
        :clickable="true"
        @click="toggleCategoryExpand(category.id)"
      >
        <template #icon>
          <div
            class="bg-accented flex size-10 items-center justify-center rounded-lg"
          >
            <UIcon :name="category.icon" class="size-5" />
          </div>
        </template>

        <template #title>
          <div class="flex flex-col gap-0.5">
            <span class="text-highlighted font-medium">
              {{ $t(category.labelKey) }}
            </span>
            <span
              v-if="category.descriptionKey"
              class="text-dimmed text-xs font-normal"
            >
              {{ $t(category.descriptionKey) }}
            </span>
          </div>
        </template>

        <template #meta>
          <UIcon
            name="i-ph-caret-right"
            :class="[
              'text-muted size-4 transition-transform duration-200',
              isCategoryExpanded(category.id) ? 'rotate-90' : '',
            ]"
          />
        </template>
      </NotificationCard>

      <div
        v-if="isCategoryExpanded(category.id)"
        class="border-muted mt-1 ml-9 space-y-1 border-l pl-4"
      >
        <NotificationCard>
          <template #title>
            <div class="flex flex-col gap-0.5">
              <span class="text-highlighted text-sm font-medium">
                {{ $t("dms.notifications.preferences.allow_notifications") }}
              </span>
            </div>
          </template>

          <template #actions>
            <div class="flex items-center gap-2">
              <UTooltip
                v-if="!canToggle(category)"
                :delay-duration="0"
                :text="$t('dms.notifications.preferences.mandatory_tooltip')"
              >
                <UButton
                  icon="i-ph-question"
                  variant="link"
                  color="neutral"
                  size="xs"
                  class="cursor-help"
                />
              </UTooltip>
              <USwitch
                :model-value="isCategoryFullyEnabled(category)"
                :disabled="!canToggle(category) || isSaving"
                :ui="{
                  base: !canToggle(category)
                    ? 'bg-(--ui-bg-accented)!'
                    : 'data-[state=unchecked]:bg-(--ui-text-dimmed)',
                }"
                @update:model-value="
                  (value: boolean) => toggleCategory(category, value)
                "
              />
            </div>
          </template>
        </NotificationCard>

        <div
          v-for="subject in subjects.filter(
            (subject) => subject.category.id === category.id,
          )"
          :key="subject.id"
        >
          <NotificationCard>
            <template #title>
              <div class="flex flex-col gap-0.5">
                <span class="text-highlighted text-sm font-medium">
                  {{ $t(subject.labelKey) }}
                </span>
                <span v-if="subject.descriptionKey" class="text-dimmed text-xs">
                  {{ $t(subject.descriptionKey) }}
                </span>
              </div>
            </template>

            <template #actions>
              <div class="flex items-center gap-2">
                <UTooltip
                  v-if="!canToggle(subject)"
                  :delay-duration="0"
                  :text="$t('dms.notifications.preferences.mandatory_tooltip')"
                >
                  <UButton
                    icon="i-ph-question"
                    variant="link"
                    color="neutral"
                    size="xs"
                    class="cursor-help"
                  />
                </UTooltip>
                <USwitch
                  :model-value="
                    preferences[buildPreferenceKey(category.id, subject.id)] ??
                    true
                  "
                  :disabled="!canToggle(subject) || isSaving"
                  :ui="{
                    base: !canToggle(subject)
                      ? 'bg-(--ui-bg-accented)!'
                      : 'data-[state=unchecked]:bg-(--ui-text-dimmed)',
                  }"
                  @update:model-value="
                    (value: boolean) =>
                      toggleSubject(category.id, subject.id, value)
                  "
                />
              </div>
            </template>
          </NotificationCard>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="flex items-center justify-center py-8">
    <UIcon name="i-ph-spinner" class="size-8 animate-spin" />
  </div>
</template>
