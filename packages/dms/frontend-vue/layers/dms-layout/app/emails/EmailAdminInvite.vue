<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailButton from "./components/EmailButton.vue";
import { emailStyles } from "./components/index";

defineProps<{
  email: string;
  signupLink: string;
  expiresIn: string;
}>();
</script>

<template>
  <EmailLayout title="You're Invited!">
    <EText :style="emailStyles.text">Hello,</EText>

    <EText :style="emailStyles.text">
      You've been invited to join our platform. Click the button below to create
      your account:
    </EText>

    <EmailButton :href="signupLink" :expires-in="expiresIn">
      Create Account
    </EmailButton>

    <template #footer>
      <EText :style="emailStyles.footer">
        If you didn't expect this invitation, you can safely ignore this email.
      </EText>
    </template>
  </EmailLayout>
</template>
