<script setup lang="ts">
import { emailStyles } from "./index";

defineProps<{
  href?: string;
  expiresIn?: string;
  expiresLabel?: string;
}>();
</script>

<template>
  <ESection :style="emailStyles.buttonContainer">
    <EButton :href="href" :style="emailStyles.button">
      <slot />
    </EButton>
  </ESection>

  <EText v-if="expiresIn" :style="emailStyles.expires">
    {{ expiresLabel ?? "This invitation expires in" }} {{ expiresIn }}.
  </EText>
</template>
