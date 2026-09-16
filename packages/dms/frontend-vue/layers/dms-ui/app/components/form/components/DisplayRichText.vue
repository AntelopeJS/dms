<script setup lang="ts">
import DOMPurify from "isomorphic-dompurify";

interface DisplayRichTextProps {
  modelValue?: string;
}

const props = defineProps<DisplayRichTextProps>();
const { t } = useI18n();

const RICH_TEXT_PROSE_CLASSES =
  "prose prose-neutral dark:prose-invert max-w-none text-sm [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:mb-4 [&_h1]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-default [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted [&_blockquote]:my-4";

const isEmpty = computed(() => {
  const value = props.modelValue;
  if (!value) return true;
  return value.replace(/<[^>]*>/g, "").trim() === "";
});

const sanitizedHtml = computed(() =>
  props.modelValue ? DOMPurify.sanitize(props.modelValue) : "",
);
</script>

<template>
  <span v-if="isEmpty" class="text-dimmed text-sm">
    {{ t("dms.form.empty_value") }}
  </span>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-else :class="RICH_TEXT_PROSE_CLASSES" v-html="sanitizedHtml" />
</template>
