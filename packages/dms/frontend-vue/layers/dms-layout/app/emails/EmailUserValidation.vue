<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  validationCode: string;
  expiresIn: string;
}>();
</script>

<template>
  <EmailLayout title="Verify Your Email">
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      Thank you for signing up! Enter the verification code below to verify your
      email address:
    </EText>

    <EmailOTP :code="validationCode" :expires-in="expiresIn" />

    <template #footer>
      <EText :style="emailStyles.footer">
        If you didn't create an account, you can safely ignore this email.
      </EText>
    </template>
  </EmailLayout>
</template>
