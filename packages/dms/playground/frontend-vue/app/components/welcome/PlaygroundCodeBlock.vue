<script setup lang="ts">
/**
 * A read-only code sample of the welcome page, drawn by the public
 * `DmsCodeSnippet`: the backend passes the code through `.options()`, so the
 * sample sits next to the page class that shows it.
 */
type CodeLanguage = "typescript" | "shell";

interface Props {
  /** The code, verbatim. */
  code: string;
  /** Shown in the head above the code (a path, or "Terminal"). */
  filename?: string;
  language?: CodeLanguage;
}

const props = withDefaults(defineProps<Props>(), {
  filename: undefined,
  language: "typescript",
});
</script>

<template>
  <DmsCodeSnippet
    :code="props.code"
    :language="props.language"
    :title="props.filename"
  />
</template>
