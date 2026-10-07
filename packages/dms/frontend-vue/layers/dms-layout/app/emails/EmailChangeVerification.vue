<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  newEmail: string;
  code: string;
  expiresIn: string;
}>();
</script>

<template>
  <EmailLayout title="Confirm your new sign-in email">
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      Enter the code below to make {{ newEmail }} the sign-in email of your
      account:
    </EText>

    <EmailOTP :code="code" :expires-in="expiresIn" />

    <template #footer>
      <EText :style="emailStyles.footer">
        If you didn't ask for this change, you can safely ignore this email:
        your account keeps its current address.
      </EText>
    </template>
  </EmailLayout>
</template>
