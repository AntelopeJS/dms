<script setup lang="ts">
import { useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  resetCode: string;
  expiresIn: string;
  expiresInHours: number;
}>();

const { t, locale } = useI18n();
</script>

<template>
  <EmailLayout
    :title="t('emails.reset_password.title')"
    :lang="locale"
    public-logo-only
  >
    <EText :style="emailStyles.text">
      {{ t("emails.common.greeting", { name: userName }) }}
    </EText>

    <EText :style="emailStyles.text">
      {{ t("emails.reset_password.body") }}
    </EText>

    <EmailOTP
      :code="resetCode"
      :expires-in="t('emails.common.hours', expiresInHours)"
    />

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.reset_password.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
