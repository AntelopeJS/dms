<script setup lang="ts">
import { computed } from "vue";
import DmsCodeSnippet from "../code-snippet/CodeSnippet.vue";
import DmsBlockStatus from "../../build/components/blocks/BlockStatus.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "../../../../dms-core/app/types/composed-text";

/** What the block's data source answers (interface-dms `CodeBlockResponse`). */
interface CodeBlockResponse {
  code?: string;
  language?: string;
}

// `CodeBlock` block (interface-dms `base/code-block`): read-only code with
// highlighting and a copy button, written in the options or read from a
// route answering `{ code, language? }`. DmsCodeSnippet draws it.
interface CodeBlockProps extends DefaultComponentProps {
  code?: string;
  language?: string;
  copy?: boolean;
  /** A string (`$` for an i18n key) or a composed text. */
  title?: BlockText;
  maxLines?: number;
  wrap?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: string;
}

const props = withDefaults(defineProps<CodeBlockProps>(), {
  code: "",
  language: undefined,
  copy: true,
  title: undefined,
  maxLines: undefined,
  wrap: false,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
});

// The placeholder lines while the route answers, at the code's line height.
const SKELETON_LINE_WIDTHS = ["w-2/3", "w-1/2", "w-3/4"];

const { processText } = useComposedText();
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

const { data, isLoading, error, refresh } = useChartFetch<CodeBlockResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
  watchSource: () => JSON.stringify(watchState.value),
});

const code = computed(() => data.value?.code ?? props.code);
const language = computed(() => data.value?.language ?? props.language);
const title = computed(() =>
  props.title ? processText(props.title) : undefined,
);
const showSkeleton = computed(() => isLoading.value && !data.value);
// A failed first load shows a retry in place of the code; a failed refetch
// keeps the code on screen.
const hasError = computed(
  () => !isLoading.value && !data.value && Boolean(error.value),
);
</script>

<template>
  <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
  <div
    v-else-if="showSkeleton"
    class="border-default grid gap-2 rounded-[10px] border px-3.5 py-3"
    aria-busy="true"
  >
    <USkeleton
      v-for="width in SKELETON_LINE_WIDTHS"
      :key="width"
      class="h-3"
      :class="width"
    />
  </div>
  <DmsCodeSnippet
    v-else
    :code="code"
    :language="language"
    :copy="props.copy"
    :title="title"
    :max-lines="props.maxLines"
    :wrap="props.wrap"
  />
</template>
