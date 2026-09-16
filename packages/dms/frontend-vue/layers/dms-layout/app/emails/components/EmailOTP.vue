<script setup lang="ts">
import { emailStyles } from "./index";

defineProps<{
  code?: string;
  expiresIn?: string;
  expiresLabel?: string;
}>();
</script>

<template>
  <ESection :style="emailStyles.otp.box">
    <EText :style="emailStyles.otp.label">Your verification code is:</EText>
    <EText :style="emailStyles.otp.code">
      {{ code }}
    </EText>
  </ESection>

  <EText v-if="expiresIn" :style="emailStyles.expires">
    {{ expiresLabel ?? "This code expires in" }} {{ expiresIn }}.
  </EText>
</template>
