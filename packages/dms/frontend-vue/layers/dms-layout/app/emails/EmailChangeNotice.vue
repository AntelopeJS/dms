<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  newEmail: string;
}>();
</script>

<template>
  <EmailLayout title="Your sign-in email is being changed">
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      Someone signed in to your account asked to change its sign-in email to
      {{ newEmail }}. The change takes effect once that address is confirmed.
    </EText>

    <template #footer>
      <EText :style="emailStyles.footer">
        If this wasn't you, change your password now and sign out the other
        sessions in Security: your account keeps this address until the new
        one is confirmed.
      </EText>
    </template>
  </EmailLayout>
</template>
