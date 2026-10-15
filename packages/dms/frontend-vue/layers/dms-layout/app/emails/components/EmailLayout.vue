<script setup lang="ts">
import type { DmsLogoSources } from "#dms-core/shared/types/app-config";
import { emailLogoUrl, emailStyles } from "./index";

interface EmailLogoConfig {
  default?: Partial<DmsLogoSources>;
  email?: Partial<DmsLogoSources>;
}

interface EmailAppConfig {
  branding?: {
    logo?: EmailLogoConfig;
  };
}

const DARK_SCHEME_MEDIA = "(prefers-color-scheme: dark)";

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

const logo = appConfig.branding?.logo;
const clientBaseUrl = runtimeConfig.public.dms?.clientBaseUrl ?? "";

function logoSource(path: string | undefined): string {
  if (props.publicLogoOnly) return emailLogoUrl(path, clientBaseUrl);
  return path?.startsWith("/") ? `${clientBaseUrl}${path}` : (path ?? "");
}

const logoUrl = logoSource(logo?.email?.light || logo?.default?.light);
// Offered to the mail clients that follow the reader's dark mode; the others
// skip the picture's source and draw the light image. Taken from the email
// slot only, so an instance that sets none keeps its single image.
const darkCandidate = logoSource(logo?.email?.dark);
const darkLogoUrl = darkCandidate === logoUrl ? "" : darkCandidate;
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
            <picture v-if="darkLogoUrl">
              <source :media="DARK_SCHEME_MEDIA" :srcset="darkLogoUrl" />
              <EImg
                :src="logoUrl"
                :alt="logoAlt"
                :style="emailStyles.logoImage"
              />
            </picture>
            <EImg
              v-else
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
