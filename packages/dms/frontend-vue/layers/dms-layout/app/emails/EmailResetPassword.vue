<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  resetCode: string;
  expiresIn: string;
}>();
</script>

<template>
  <EmailLayout title="Reset Your Password">
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      We received a request to reset your password. Enter the verification code
      below to reset your password:
    </EText>

    <EmailOTP :code="resetCode" :expires-in="expiresIn" />

    <template #footer>
      <EText :style="emailStyles.footer">
        If you didn't request a password reset, you can safely ignore this
        email. Your password will remain unchanged.
      </EText>
    </template>
  </EmailLayout>
</template>
