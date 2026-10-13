<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { emailStyles } from "./index";

defineProps<{
  code?: string;
  expiresIn?: string;
  expiresLabel?: string;
}>();

const { t } = useI18n();
</script>

<template>
  <ESection :style="emailStyles.otp.box">
    <EText :style="emailStyles.otp.label">
      {{ t("emails.common.code_label") }}
    </EText>
    <EText :style="emailStyles.otp.code">
      {{ code }}
    </EText>
  </ESection>

  <EText v-if="expiresIn" :style="emailStyles.expires">
    {{ expiresLabel ?? t("emails.common.code_expires_label") }}
    {{ expiresIn }}.
  </EText>
</template>
