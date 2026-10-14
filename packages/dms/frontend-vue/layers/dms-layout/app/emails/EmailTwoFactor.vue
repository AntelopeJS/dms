<script setup lang="ts">
import { useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import EmailOTP from "./components/EmailOTP.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  verificationCode: string;
}>();

const { t, locale } = useI18n();
</script>

<template>
  <EmailLayout
    :title="t('emails.two_factor.title')"
    :lang="locale"
    public-logo-only
  >
    <EText :style="emailStyles.text">
      {{ t("emails.common.greeting", { name: userName }) }}
    </EText>

    <EText :style="emailStyles.text">
      {{ t("emails.two_factor.body") }}
    </EText>

    <EmailOTP :code="verificationCode" />

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.two_factor.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
