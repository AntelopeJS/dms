<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { t } = useI18n();
const { processI18n } = useTranslation();
const { categoryGroups } = useQuickActions();

const TITLE_GROUP_CLASS =
  "text-sm font-semibold text-default normal-case tracking-normal px-3 pt-2 pb-3";

function buildActionEntry(action: QuickActionInfo): DropdownMenuItem {
  return {
    label: processI18n(action.displayName),
    icon: action.icon,
    onSelect: () => {
      void dispatchQuickActionTarget(action.target);
    },
  };
}

function buildCategoryGroup(
  group: QuickActionCategoryGroup,
): DropdownMenuItem[] {
  const header: DropdownMenuItem = {
    label: processI18n(group.category.displayName).toUpperCase(),
    type: "label" as const,
  };
  return [header, ...group.actions.map(buildActionEntry)];
}

const groupedItems = computed((): DropdownMenuItem[][] => {
  const groups = categoryGroups.value;
  if (groups.length === 0) return [];

  const titleGroup: DropdownMenuItem[] = [
    {
      label: t("quickActions.title"),
      type: "label" as const,
      class: TITLE_GROUP_CLASS,
    },
  ];

  return [titleGroup, ...groups.map(buildCategoryGroup)];
});

const hasItems = computed(() => groupedItems.value.length > 1);
</script>

<template>
  <UDropdownMenu
    v-if="hasItems"
    :items="groupedItems"
    :content="{ align: 'end' }"
    :ui="{
      content: 'w-72 p-2',
      label: 'text-xs font-semibold tracking-wider text-muted px-3 pt-3 pb-2',
      item: 'gap-3 px-3 py-2',
      itemLeadingIcon: 'size-5',
    }"
  >
    <UButton
      icon="i-ph-lightning-light"
      variant="ghost"
      color="neutral"
      :ui="{ leadingIcon: 'size-[18px]' }"
    />
  </UDropdownMenu>
</template>
