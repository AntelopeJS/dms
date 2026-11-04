<script setup lang="ts">
/**
 * The source of one of the playground's own files, read at build time, so a
 * demo page shows the exact registration code it runs and never drifts from
 * it.
 */
interface Props {
  /** Path from `frontend-vue/app/`, e.g. `plugins/side-panel-demo.ts`. */
  path: string;
  /** Lines shown before the code scrolls. */
  maxLines?: number;
}

const props = withDefaults(defineProps<Props>(), { maxLines: 30 });

const LANGUAGE_BY_EXTENSION = new Map([
  ["ts", "typescript"],
  ["vue", "html"],
]);

const RAW_SOURCES = import.meta.glob<string>(
  [
    "../../plugins/*.ts",
    "../../composables/*.ts",
    "../custom/*.vue",
    "../chrome/PlaygroundOverlayBubble.vue",
  ],
  { query: "?raw", import: "default", eager: true },
);

const SOURCES_BY_PATH = new Map(
  Object.entries(RAW_SOURCES).map(([file, code]): [string, string] => [
    file.replace(/^\.\.\/\.\.\//, "").replace(/^\.\.\//, "components/"),
    code,
  ]),
);

const source = computed(() => SOURCES_BY_PATH.get(props.path) ?? "");
const language = computed(
  () => LANGUAGE_BY_EXTENSION.get(props.path.split(".").at(-1) ?? "") ?? "text",
);
</script>

<template>
  <DmsCodeSnippet
    :code="source"
    :language="language"
    :title="`app/${props.path}`"
    :max-lines="props.maxLines"
  />
</template>
