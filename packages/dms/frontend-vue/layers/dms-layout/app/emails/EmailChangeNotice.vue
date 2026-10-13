<script setup lang="ts">
import { useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  newEmail: string;
}>();

const { t, locale } = useI18n();
</script>

<template>
  <EmailLayout
    :title="t('emails.email_change_notice.title')"
    :lang="locale"
    public-logo-only
  >
    <EText :style="emailStyles.text">
      {{ t("emails.common.greeting", { name: userName }) }}
    </EText>

    <EText :style="emailStyles.text">
      {{ t("emails.email_change_notice.body", { email: newEmail }) }}
    </EText>

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.email_change_notice.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
