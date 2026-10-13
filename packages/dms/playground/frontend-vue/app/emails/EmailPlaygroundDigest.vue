<script setup lang="ts">
/**
 * The playground's own email template, registered on the backend with
 * `RegisterHtmlTemplate("EmailPlaygroundDigest")` and rendered with
 * `GenerateHtml`. It reuses the DMS's `EmailLayout` without its heading
 * divider and with a logo only when a mail client can load it.
 */
import EmailLayout from "#dms-layout/app/emails/components/EmailLayout.vue";
import { emailStyles } from "#dms-layout/app/emails/components/index";

defineProps<{
  userName: string;
  count: number;
}>();
</script>

<template>
  <EmailLayout
    title="Your playground digest"
    :divider="false"
    public-logo-only
    :preheader="`${count} things happened in the playground`"
  >
    <template #head>
      <meta name="x-playground-template" content="EmailPlaygroundDigest" />
    </template>

    <EText :style="emailStyles.text">Hello {{ userName }},</EText>
    <EText :style="emailStyles.text">
      {{ count }} things happened in the playground since your last visit.
    </EText>

    <template #footer>
      <EText :style="emailStyles.footer">
        Sent by the DMS playground's emails demo.
      </EText>
    </template>
  </EmailLayout>
</template>
