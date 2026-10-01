<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";
import { quickActionKey } from "#dms-core/app/utils/permission-preview";

const { t } = useI18n();
const { processI18n } = useTranslation();
const { categoryGroups } = useQuickActions();

// v2 quick actions menu: a plain title over mono-eyebrow category groups.
const TITLE_GROUP_CLASS =
  "font-sans text-[13px] font-semibold text-highlighted normal-case tracking-normal px-2.5 pt-1.5 pb-2";

// "Preview as role": an action the role would not be served stays listed,
// hatched and locked. Never outside a preview.
const preview = usePermissionPreview();
const PREVIEW_LOCK_ICON = "i-ph-lock-simple";
const PREVIEW_LOCK_CLASS =
  "text-muted bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-error)_9%,transparent)_0_6px,transparent_6px_12px)]";

function buildActionEntry(action: QuickActionInfo): DropdownMenuItem {
  const entry: DropdownMenuItem = {
    label: processI18n(action.displayName),
    icon: action.icon,
    onSelect: () => {
      void dispatchQuickActionTarget(action.target);
    },
  };
  if (!preview.isQuickActionHidden(quickActionKey(action))) return entry;
  return {
    ...entry,
    class: PREVIEW_LOCK_CLASS,
    trailingIcon: PREVIEW_LOCK_ICON,
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
      content: 'w-72 p-1.5',
      label:
        'font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase text-dimmed px-2 pt-2 pb-1',
      item: 'h-[30px] gap-2.5 px-2 text-[13px]',
      itemLeadingIcon: 'size-4 text-muted',
    }"
  >
    <UTooltip
      :text="$t('quickActions.title')"
      :content="{ side: 'bottom', sideOffset: 6 }"
    >
      <UButton
        icon="i-ph-lightning-light"
        variant="ghost"
        color="neutral"
        class="text-muted hover:text-highlighted data-[state=open]:text-highlighted"
        :aria-label="$t('quickActions.title')"
        :ui="{ leadingIcon: 'size-[18px]' }"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
