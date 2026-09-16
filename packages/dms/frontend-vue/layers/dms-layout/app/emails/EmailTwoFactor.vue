<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";

defineProps<{
  userName: string;
  verificationCode: string;
}>();
</script>

<template>
  <EmailLayout title="Your verification code">
    <p>Hello {{ userName }},</p>
    <p>Use this verification code to finish signing in:</p>
    <EmailOTP :code="verificationCode" />
    <p>If you did not attempt to sign in, you can safely ignore this email.</p>
  </EmailLayout>
</template>
