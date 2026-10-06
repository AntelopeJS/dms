<script setup lang="ts">
import type { RoleMemberPreview } from "./role-types";

interface RoleMemberAvatarsProps {
  members: RoleMemberPreview[];
  /** Ring color separating the stacked avatars from what is behind them. */
  ringClass?: string;
}

const props = withDefaults(defineProps<RoleMemberAvatarsProps>(), {
  ringClass: "ring-(--ui-bg)",
});
</script>

<template>
  <!-- v2 .avatar-stack of .avatar--sm: initials on the accent gradient,
       overlapping with a ring in the surface color. -->
  <UAvatarGroup
    v-if="props.members.length > 0"
    size="xs"
    :ui="{ base: ['ring-2 -me-1.5', props.ringClass] }"
  >
    <UAvatar
      v-for="member in props.members"
      :key="member.userId"
      :alt="member.name"
      :title="member.name"
    />
  </UAvatarGroup>
</template>
