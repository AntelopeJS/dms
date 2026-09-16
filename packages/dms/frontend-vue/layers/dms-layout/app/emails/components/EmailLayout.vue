<script setup lang="ts">
import { emailStyles } from "./index";

interface EmailAppConfig {
  branding?: {
    logo?: {
      default?: {
        light?: string;
      };
    };
  };
}

defineProps<{
  title: string;
  lang?: string;
}>();

const appConfig = useDmsAppConfig() as EmailAppConfig;
const runtimeConfig = useDmsRuntimeConfig();

const logoPath = appConfig.branding?.logo?.default?.light;
const clientBaseUrl = runtimeConfig.public.dms?.clientBaseUrl ?? "";
const logoUrl = logoPath?.startsWith("/")
  ? `${clientBaseUrl}${logoPath}`
  : logoPath;
</script>

<template>
  <EHtml :lang="lang ?? 'en'">
    <EHead />
    <EBody :style="emailStyles.main">
      <EContainer :style="emailStyles.container">
        <ESection :style="emailStyles.card">
          <ESection v-if="logoUrl" :style="emailStyles.logo">
            <EImg :src="logoUrl" alt="Logo" :style="emailStyles.logoImage" />
          </ESection>

          <EHeading as="h1" :style="emailStyles.heading">
            {{ title }}
          </EHeading>

          <slot />

          <EHr :style="emailStyles.divider" />

          <slot name="footer" />
        </ESection>
      </EContainer>
    </EBody>
  </EHtml>
</template>
