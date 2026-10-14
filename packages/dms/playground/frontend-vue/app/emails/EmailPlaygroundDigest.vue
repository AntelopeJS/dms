<script setup lang="ts">
/**
 * The playground's own email template, registered on the backend with
 * `RegisterHtmlTemplate("EmailPlaygroundDigest")` and rendered with
 * `GenerateHtml`. It reuses the DMS's `EmailLayout` without its heading
 * divider and with a logo only when a mail client can load it. The language
 * arrives as a prop: the template picks its texts and the document `lang`.
 */
import { computed } from "vue";
import EmailLayout from "#dms-layout/app/emails/components/EmailLayout.vue";
import { emailStyles } from "#dms-layout/app/emails/components/index";

interface DigestTexts {
  title: string;
  preheader: (count: number) => string;
  greeting: (name: string) => string;
  body: (count: number) => string;
  footer: string;
}

const DEFAULT_LOCALE = "en";

const TEXTS: Record<string, DigestTexts> = {
  en: {
    title: "Your playground digest",
    preheader: (count) => `${count} things happened in the playground`,
    greeting: (name) => `Hello ${name},`,
    body: (count) =>
      `${count} things happened in the playground since your last visit.`,
    footer: "Sent by the DMS playground's emails demo.",
  },
  fr: {
    title: "Votre résumé du playground",
    preheader: (count) => `${count} nouveautés dans le playground`,
    greeting: (name) => `Bonjour ${name},`,
    body: (count) =>
      `${count} choses se sont passées dans le playground depuis votre dernière visite.`,
    footer: "Envoyé par la démo des emails du playground DMS.",
  },
};

const props = defineProps<{
  userName: string;
  count: number;
  locale?: string;
}>();

const lang = computed(() =>
  props.locale && TEXTS[props.locale] ? props.locale : DEFAULT_LOCALE,
);
const texts = computed(() => TEXTS[lang.value] ?? TEXTS[DEFAULT_LOCALE]);
</script>

<template>
  <EmailLayout
    :title="texts.title"
    :lang="lang"
    :divider="false"
    public-logo-only
    :preheader="texts.preheader(count)"
  >
    <template #head>
      <meta name="x-playground-template" content="EmailPlaygroundDigest" />
    </template>

    <EText :style="emailStyles.text">{{ texts.greeting(userName) }}</EText>
    <EText :style="emailStyles.text">{{ texts.body(count) }}</EText>

    <template #footer>
      <EText :style="emailStyles.footer">{{ texts.footer }}</EText>
    </template>
  </EmailLayout>
</template>
