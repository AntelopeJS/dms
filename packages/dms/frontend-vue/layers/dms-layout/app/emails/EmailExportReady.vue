<script setup lang="ts">
import EmailLayout from "./components/EmailLayout.vue";
import EmailButton from "./components/EmailButton.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  downloadLink: string;
  expiresIn: string;
  partial: boolean;
  failedSources: string[];
}>();
</script>

<template>
  <EmailLayout title="Your data export is ready">
    <EText :style="emailStyles.text">Hello {{ userName }},</EText>

    <EText :style="emailStyles.text">
      Your data export has been prepared. Use the button below to download the
      archive:
    </EText>

    <EmailButton
      :href="downloadLink"
      :expires-in="expiresIn"
      expires-label="This download link expires in"
    >
      Download export
    </EmailButton>

    <EText v-if="partial" :style="emailStyles.text">
      This export is
      <strong>incomplete</strong>
      : the following parts could not be included —
      {{ failedSources.join(", ") }}. Request a new export if you need them.
    </EText>

    <template #footer>
      <EText :style="emailStyles.footer">
        If you didn't request this export, you can safely ignore this email.
      </EText>
    </template>
  </EmailLayout>
</template>
