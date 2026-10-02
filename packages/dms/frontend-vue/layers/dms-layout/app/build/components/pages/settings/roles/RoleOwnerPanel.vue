<script setup lang="ts">
import type { RoleOwnersSummary } from "./role-types";

interface RoleOwnerPanelProps {
  owners: RoleOwnersSummary;
}

const props = defineProps<RoleOwnerPanelProps>();
const { t } = useI18n();

const MEMBERS_PAGE_PATH = "/settings/user/members";
</script>

<template>
  <!-- v2 "Owner role · locked": the owner is not a stored role, so the editor
       explains it instead of offering a tree. -->
  <section class="dms-card min-w-0" aria-labelledby="role-owner-title">
    <div
      class="border-default flex items-center gap-3 border-b py-3.5 ps-[18px] pe-4"
    >
      <DmsIconWell icon="i-ph-crown" size="md" />
      <h2
        id="role-owner-title"
        class="text-highlighted flex items-center gap-2 text-[15px] leading-[1.3] font-[650] tracking-[-0.01em]"
      >
        {{ t("page.settings.roles.editor.owner") }}
        <UIcon name="i-ph-lock-simple" class="text-dimmed size-4" />
        <span class="text-dimmed font-mono text-[10.5px] font-medium">
          {{
            t(
              "page.settings.roles.editor.members_count",
              props.owners.memberCount,
            )
          }}
        </span>
      </h2>
    </div>
    <DmsEmptyState
      variant="no-access"
      icon="i-ph-lock-key"
      :title="t('page.settings.roles.editor.owner_title')"
      :description="t('page.settings.roles.editor.owner_description')"
    >
      <template #actions>
        <UButton
          :to="MEMBERS_PAGE_PATH"
          color="neutral"
          variant="outline"
          size="sm"
          :label="t('page.settings.roles.editor.open_members')"
        />
      </template>
    </DmsEmptyState>
  </section>
</template>
