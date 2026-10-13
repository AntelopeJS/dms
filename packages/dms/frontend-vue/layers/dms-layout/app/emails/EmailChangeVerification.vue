<script setup lang="ts">
import { useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  newEmail: string;
  code: string;
  expiresIn: string;
  expiresInHours: number;
}>();

const { t, locale } = useI18n();
</script>

<template>
  <EmailLayout
    :title="t('emails.email_change_verification.title')"
    :lang="locale"
    public-logo-only
  >
    <EText :style="emailStyles.text">
      {{ t("emails.common.greeting", { name: userName }) }}
    </EText>

    <EText :style="emailStyles.text">
      {{ t("emails.email_change_verification.body", { email: newEmail }) }}
    </EText>

    <EmailOTP
      :code="code"
      :expires-in="t('emails.common.hours', expiresInHours)"
    />

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.email_change_verification.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
