<script setup lang="ts">
import DmsCard from "#dms-ui/app/components/card/Card.vue";
import RolePanelHead from "./RolePanelHead.vue";
import type { RoleOwnersSummary } from "./role-types";

interface RoleOwnerPanelProps {
  owners: RoleOwnersSummary;
}

const props = defineProps<RoleOwnerPanelProps>();
const { t } = useI18n();

const MEMBERS_PAGE_PATH = "/settings/workspace/members";
</script>

<template>
  <!-- v2 "Owner role · locked": the owner is not a stored role, so the editor
       explains it instead of offering a tree. -->
  <DmsCard
    as="section"
    :padded="false"
    class="min-w-0"
    aria-labelledby="role-owner-title"
  >
    <template #header>
      <RolePanelHead
        icon="i-ph-crown"
        title-id="role-owner-title"
        :meta="
          t(
            'page.settings.roles.editor.members_count',
            props.owners.memberCount,
          )
        "
      >
        {{ t("page.settings.roles.editor.owner") }}
        <UIcon name="i-ph-lock-simple" class="text-dimmed size-4" />
      </RolePanelHead>
    </template>
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
  </DmsCard>
</template>
