<script setup lang="ts">
import { TEXT_LINK_CLASS } from "#dms-ui/app/build/utils/textLink";
import DmsCard from "#dms-ui/app/components/card/Card.vue";
import RoleMemberAvatars from "./RoleMemberAvatars.vue";
import RolesListItem from "./RolesListItem.vue";
import {
  NEW_ROLE_ENTRY_ID,
  OWNER_ENTRY_ID,
  type RoleOwnersSummary,
  type RoleSummary,
} from "./role-types";

interface RolesListProps {
  roles: RoleSummary[];
  owners: RoleOwnersSummary;
  totalPermissions: number;
  selectedId: string;
  /** Name typed for the role being created, shown as an unsaved entry. */
  draftName: string | null;
}

const props = defineProps<RolesListProps>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();
const query = ref("");

const PERCENT = 100;

const visibleRoles = computed(() => {
  const normalized = query.value.trim().toLowerCase();
  if (!normalized) return props.roles;
  return props.roles.filter((role) =>
    `${role.name} ${role.description}`.toLowerCase().includes(normalized),
  );
});

function coverage(count: number): number {
  if (props.totalPermissions === 0) return 0;
  return Math.min(PERCENT, (count / props.totalPermissions) * PERCENT);
}
</script>

<template>
  <!-- v2 .cs-rlist: a card of roles, each with its members and a coverage bar;
       it sticks beside the editor while the permission tree scrolls. -->
  <DmsCard
    as="aside"
    :padded="false"
    class="@3xl:sticky @3xl:top-6"
    :title="t('page.settings.roles.editor.list_title')"
    :count="props.roles.length + 1"
    :aria-label="t('page.settings.roles.editor.list_title')"
  >
    <template #actions>
      <span class="text-dimmed font-mono text-[10.5px] font-medium">
        {{ t("page.settings.roles.editor.list_members") }}
      </span>
    </template>
    <div class="border-muted border-b px-3 py-2">
      <DmsSearchInput
        v-model="query"
        size="sm"
        variant="none"
        class="w-full"
        :placeholder="t('page.settings.roles.editor.search_roles')"
      />
    </div>
    <div
      role="listbox"
      :aria-label="t('page.settings.roles.editor.list_title')"
    >
      <RolesListItem
        :name="t('page.settings.roles.editor.owner')"
        :is-active="props.selectedId === OWNER_ENTRY_ID"
        is-locked
        :member-count="props.owners.memberCount"
        :coverage="100"
        :summary="
          t('page.settings.roles.editor.owner_summary', {
            total: props.totalPermissions,
          })
        "
        @select="emit('select', OWNER_ENTRY_ID)"
      >
        <template #avatars>
          <RoleMemberAvatars :members="props.owners.members" />
        </template>
      </RolesListItem>
      <RolesListItem
        v-for="role in visibleRoles"
        :key="role._id"
        :name="role.name"
        :is-active="props.selectedId === role._id"
        :member-count="role.memberCount"
        :invite-count="role.inviteCount"
        :coverage="coverage(role.permissionCount)"
        :summary="
          t('page.settings.roles.editor.permission_summary', {
            count: role.permissionCount,
            total: props.totalPermissions,
          })
        "
        @select="emit('select', role._id)"
      >
        <template #avatars>
          <RoleMemberAvatars
            :members="role.members"
            :ring-class="
              props.selectedId === role._id
                ? 'ring-(--ui-bg-elevated)'
                : 'ring-(--ui-bg)'
            "
          />
        </template>
      </RolesListItem>
      <RolesListItem
        v-if="props.draftName !== null"
        :name="props.draftName || t('page.settings.roles.editor.untitled')"
        :is-active="props.selectedId === NEW_ROLE_ENTRY_ID"
        is-draft
        :member-count="0"
        :coverage="0"
        :summary="t('page.settings.roles.editor.unsaved')"
        @select="emit('select', NEW_ROLE_ENTRY_ID)"
      />
      <p
        v-if="query && visibleRoles.length === 0"
        class="border-muted text-muted border-t px-4 py-3 text-[12.5px]"
      >
        {{ t("page.settings.roles.editor.no_role_match") }}
      </p>
    </div>
    <template #footer>
      <UIcon name="i-ph-info" class="text-dimmed size-4 shrink-0" />
      <span class="text-muted text-[12.5px]">
        {{ t("page.settings.roles.editor.foot_prefix") }}
        <DmsLink to="/settings/workspace/members" :class="TEXT_LINK_CLASS">
          {{ t("page.settings.roles.editor.foot_link") }}
        </DmsLink>
      </span>
    </template>
  </DmsCard>
</template>
