<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import DmsCopyButton from "../copy/CopyButton.vue";
import {
  codeLanguageLabel,
  PLAIN_CODE_LANGUAGE,
  resolveCodeLanguage,
} from "../../build/utils/codeLanguages";
import type { CodeToken, highlightCode } from "../../build/utils/codeHighlight";

// Read-only code in the editor's look: a head with the title, the language
// and a copy button, then the code highlighted by the editor's languages.
// Without a title or a language there is no head: the copy button floats in
// the code's corner. Until the highlighter loads (and on the server) the
// code shows as is.

/**
 * How long lines break: `false` scrolls them sideways, `true` wraps them
 * between words, `"anywhere"` also breaks a word too long for the line (a
 * URL, a token, a minified payload).
 */
type CodeSnippetWrap = boolean | "anywhere";

interface CodeSnippetProps {
  /** The code, verbatim. */
  code: string;
  /**
   * `json`, `javascript`, `typescript`, `html`, `sql`, `shell` or `text`;
   * `js`, `ts`, `bash`, `sh` and `plain` are read as theirs.
   */
  language?: string;
  /** A button copies the code. */
  copy?: boolean;
  /** Shown in the head, as written. */
  title?: string;
  /** Lines shown before the code scrolls; all of them when unset. */
  maxLines?: number;
  /**
   * A CSS height the code scrolls past (`"20rem"`), when `maxLines` is not
   * set: for a payload whose lines differ in length once wrapped.
   */
  maxHeight?: string;
  /** Wraps long lines instead of scrolling sideways. */
  wrap?: CodeSnippetWrap;
}

const props = withDefaults(defineProps<CodeSnippetProps>(), {
  language: undefined,
  copy: true,
  title: undefined,
  maxLines: undefined,
  maxHeight: undefined,
  wrap: false,
});

const LINE_HEIGHT_PX = 19;
// The code's top and bottom padding (`py-2`), around its lines.
const CODE_PADDING_PX = 16;

const WRAP_CLASSES: Record<"false" | "true" | "anywhere", string> = {
  false: "whitespace-pre",
  true: "break-words whitespace-pre-wrap",
  anywhere: "whitespace-pre-wrap [overflow-wrap:anywhere]",
};

const highlight = shallowRef<typeof highlightCode | null>(null);

const language = computed(() => resolveCodeLanguage(props.language));
// A language given, even `text`, is named in a head; without a title either,
// a head would only hold the copy button.
const isHeadless = computed(() => !props.title && props.language === undefined);
const hasHead = computed(
  () =>
    !isHeadless.value &&
    (!!props.title || props.copy || language.value !== PLAIN_CODE_LANGUAGE),
);
const hasFloatingCopy = computed(() => isHeadless.value && props.copy);
const wrapClass = computed(
  () => WRAP_CLASSES[String(props.wrap) as keyof typeof WRAP_CLASSES],
);
const tokens = computed<CodeToken[]>(() =>
  highlight.value
    ? highlight.value(props.code, language.value)
    : [{ text: props.code }],
);
const sizeStyle = computed(() => {
  if (props.maxLines)
    return {
      maxHeight: `${props.maxLines * LINE_HEIGHT_PX + CODE_PADDING_PX}px`,
    };
  return props.maxHeight ? { maxHeight: props.maxHeight } : undefined;
});

onMounted(async () => {
  const module = await import("../../build/utils/codeHighlight");
  highlight.value = module.highlightCode;
});
</script>

<template>
  <div
    class="border-default relative min-w-0 overflow-hidden rounded-[10px] border bg-(--ui-bg)"
  >
    <div
      v-if="hasHead"
      class="border-default flex min-h-9 items-center gap-2 border-b bg-(--dms-bg-muted) py-1 ps-3.5 pe-1"
    >
      <span
        v-if="props.title"
        class="text-highlighted min-w-0 truncate text-[12.5px] font-semibold"
      >
        {{ props.title }}
      </span>
      <span class="text-dimmed ms-auto font-mono text-[11px]">
        {{ codeLanguageLabel(language) }}
      </span>
      <DmsCopyButton v-if="props.copy" :value="props.code" />
    </div>
    <!-- Kept clear of the code: the code's end padding leaves it room. -->
    <DmsCopyButton
      v-if="hasFloatingCopy"
      :value="props.code"
      class="absolute end-1 top-1"
      data-floating-copy
    />
    <!-- Focusable: a keyboard scrolls the code when it overflows. -->
    <pre
      class="text-highlighted m-0 overflow-auto py-2 ps-3.5 font-mono text-[12.5px] leading-[19px]"
      :class="[wrapClass, hasFloatingCopy ? 'pe-10' : 'pe-3.5']"
      :style="sizeStyle"
      :data-language="language"
      tabindex="0"
    ><code><span v-for="(token, index) in tokens" :key="index" :style="token.style">{{ token.text }}</span></code></pre>
  </div>
</template>
