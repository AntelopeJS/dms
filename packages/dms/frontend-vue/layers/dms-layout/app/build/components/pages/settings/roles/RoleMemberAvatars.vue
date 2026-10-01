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

const INITIALS_LENGTH = 2;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
</script>

<template>
  <!-- v2 .avatar-stack of .avatar--sm: 22px initials on the accent gradient,
       overlapping by 6px with a ring in the surface color. -->
  <span v-if="props.members.length > 0" class="inline-flex">
    <span
      v-for="(member, position) in props.members"
      :key="member.userId"
      :title="member.name"
      :class="[
        'grid size-[22px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--ui-color-primary-400),var(--ui-color-secondary-400))] text-[9px] font-semibold text-(--dms-accent-on-fill) ring-2',
        props.ringClass,
        position > 0 && '-ms-1.5',
      ]"
    >
      {{ initials(member.name) }}
    </span>
  </span>
</template>
