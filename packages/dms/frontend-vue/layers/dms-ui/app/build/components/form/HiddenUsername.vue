<script setup lang="ts">
// The account a password form belongs to, for password managers only: a
// form that shows no editable username (sign-up by invitation, reset link,
// password change) names it here so the manager saves or updates the
// password under the right entry. Hidden from sight and from assistive
// technologies, it holds no value of the form's own.

interface HiddenUsernameProps {
  username?: string | null;
}

const props = defineProps<HiddenUsernameProps>();
</script>

<template>
  <input
    v-if="props.username"
    type="text"
    name="username"
    autocomplete="username"
    :value="props.username"
    readonly
    hidden
    aria-hidden="true"
    tabindex="-1"
  />
</template>
