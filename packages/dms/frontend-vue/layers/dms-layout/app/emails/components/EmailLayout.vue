<script setup lang="ts">
import { emailLogoUrl, emailStyles } from "./index";

interface EmailAppConfig {
  branding?: {
    logo?: {
      default?: {
        light?: string;
      };
    };
  };
}

const props = withDefaults(
  defineProps<{
    /** Shown as the email's heading; no heading when omitted. */
    title?: string;
    lang?: string;
    /** Inbox preview text, hidden in the message body. */
    preheader?: string;
    /** Draws the separator between the content and the `footer` slot. */
    divider?: boolean;
    logoAlt?: string;
    /**
     * Leaves the logo out unless a mail client can load it: an absolute
     * public http(s) URL, not an SVG (see `emailLogoUrl`).
     */
    publicLogoOnly?: boolean;
  }>(),
  { divider: true, logoAlt: "Logo", publicLogoOnly: false },
);

const appConfig = useDmsAppConfig() as EmailAppConfig;
const runtimeConfig = useDmsRuntimeConfig();

const logoPath = appConfig.branding?.logo?.default?.light;
const clientBaseUrl = runtimeConfig.public.dms?.clientBaseUrl ?? "";
const logoUrl = props.publicLogoOnly
  ? emailLogoUrl(logoPath, clientBaseUrl)
  : logoPath?.startsWith("/")
    ? `${clientBaseUrl}${logoPath}`
    : logoPath;
</script>

<template>
  <EHtml :lang="lang ?? 'en'">
    <EHead>
      <slot name="head" />
    </EHead>
    <EBody :style="emailStyles.main">
      <EPreview v-if="preheader">{{ preheader }}</EPreview>
      <EContainer :style="emailStyles.container">
        <ESection :style="emailStyles.card">
          <ESection v-if="logoUrl" :style="emailStyles.logo">
            <EImg
              :src="logoUrl"
              :alt="logoAlt"
              :style="emailStyles.logoImage"
            />
          </ESection>

          <EHeading v-if="title" as="h1" :style="emailStyles.heading">
            {{ title }}
          </EHeading>

          <slot />

          <EHr v-if="divider" :style="emailStyles.divider" />

          <slot name="footer" />
        </ESection>
      </EContainer>
    </EBody>
  </EHtml>
</template>
