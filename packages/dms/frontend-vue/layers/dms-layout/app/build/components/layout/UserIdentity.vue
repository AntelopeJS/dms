<script setup lang="ts">
import type { AvatarProps } from "@nuxt/ui";

// The signed-in user as the shell shows them: initials avatar, name, then
// the e-mail in mono (the sidebar menu's trigger and its header).

interface UserIdentityProps {
  name?: string;
  email?: string;
  avatarSize?: AvatarProps["size"];
}

const props = withDefaults(defineProps<UserIdentityProps>(), {
  name: undefined,
  email: undefined,
  avatarSize: "sm",
});
</script>

<template>
  <span class="flex min-w-0 flex-1 items-center gap-2.5">
    <UAvatar :alt="props.name" :size="props.avatarSize" class="shrink-0" />
    <span class="flex min-w-0 flex-1 flex-col">
      <span
        class="text-highlighted truncate text-[13px] leading-tight font-semibold"
      >
        {{ props.name }}
      </span>
      <span class="text-muted truncate font-mono text-[11px] font-medium">
        {{ props.email }}
      </span>
    </span>
  </span>
</template>
