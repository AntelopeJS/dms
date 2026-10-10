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
// Until the highlighter loads (and on the server) the code shows as is.
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
  /** Wraps long lines instead of scrolling sideways. */
  wrap?: boolean;
}

const props = withDefaults(defineProps<CodeSnippetProps>(), {
  language: undefined,
  copy: true,
  title: undefined,
  maxLines: undefined,
  wrap: false,
});

const LINE_HEIGHT_PX = 19;
// The code's top and bottom padding (`py-2`), around its lines.
const CODE_PADDING_PX = 16;

const highlight = shallowRef<typeof highlightCode | null>(null);

const language = computed(() => resolveCodeLanguage(props.language));
const hasHead = computed(
  () => !!props.title || props.copy || language.value !== PLAIN_CODE_LANGUAGE,
);
const tokens = computed<CodeToken[]>(() =>
  highlight.value
    ? highlight.value(props.code, language.value)
    : [{ text: props.code }],
);
const sizeStyle = computed(() =>
  props.maxLines
    ? {
        maxHeight: `${props.maxLines * LINE_HEIGHT_PX + CODE_PADDING_PX}px`,
      }
    : undefined,
);

onMounted(async () => {
  const module = await import("../../build/utils/codeHighlight");
  highlight.value = module.highlightCode;
});
</script>

<template>
  <div
    class="border-default min-w-0 overflow-hidden rounded-[10px] border bg-(--ui-bg)"
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
    <!-- Focusable: a keyboard scrolls the code when it overflows. -->
    <pre
      class="text-highlighted m-0 overflow-auto px-3.5 py-2 font-mono text-[12.5px] leading-[19px]"
      :class="props.wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre'"
      :style="sizeStyle"
      :data-language="language"
      tabindex="0"
    ><code><span v-for="(token, index) in tokens" :key="index" :style="token.style">{{ token.text }}</span></code></pre>
  </div>
</template>
