<script setup lang="ts">
import { I18nT, useI18n } from "vue-i18n";
import EmailLayout from "./components/EmailLayout.vue";
import EmailButton from "./components/EmailButton.vue";
import { emailStyles } from "./components/index";

defineProps<{
  userName: string;
  downloadLink: string;
  expiresIn: string;
  expiresInHours: number;
  partial: boolean;
  failedSources: string[];
}>();

const { t, locale } = useI18n();
</script>

<template>
  <EmailLayout
    :title="t('emails.export_ready.title')"
    :lang="locale"
    public-logo-only
  >
    <EText :style="emailStyles.text">
      {{ t("emails.common.greeting", { name: userName }) }}
    </EText>

    <EText :style="emailStyles.text">
      {{ t("emails.export_ready.body") }}
    </EText>

    <EmailButton
      :href="downloadLink"
      :expires-in="t('emails.common.hours', expiresInHours)"
      :expires-label="t('emails.export_ready.expires_label')"
    >
      {{ t("emails.export_ready.button") }}
    </EmailButton>

    <EText v-if="partial" :style="emailStyles.text">
      <I18nT keypath="emails.export_ready.partial" scope="global">
        <template #incomplete>
          <strong>{{ t("emails.export_ready.incomplete") }}</strong>
        </template>
        <template #sources>{{ failedSources.join(", ") }}</template>
      </I18nT>
    </EText>

    <template #footer>
      <EText :style="emailStyles.footer">
        {{ t("emails.export_ready.footer") }}
      </EText>
    </template>
  </EmailLayout>
</template>
