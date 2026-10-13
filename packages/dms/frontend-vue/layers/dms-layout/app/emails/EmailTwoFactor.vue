<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  verificationCode: string;
}>();
</script>

<template>
  <EmailLayout title="Your verification code" public-logo-only>
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      Use this verification code to finish signing in:
    </EText>

    <EmailOTP :code="verificationCode" />

    <template #footer>
      <EText :style="emailStyles.footer">
        If you did not attempt to sign in, you can safely ignore this email.
      </EText>
    </template>
  </EmailLayout>
</template>
