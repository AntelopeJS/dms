<script setup lang="ts">
import { computed } from "vue";
import DmsCodeSnippet from "../code-snippet/CodeSnippet.vue";
import DmsBlockStatus from "../../build/components/blocks/BlockStatus.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";
import { PLAIN_CODE_LANGUAGE } from "../../build/utils/codeLanguages";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "../../../../dms-core/app/types/composed-text";

/** What the block's data source answers (interface-dms `CodeBlockResponse`). */
interface CodeBlockResponse {
  code?: string;
  language?: string;
}

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

const language = computed(
  () => data.value?.language ?? props.language ?? PLAIN_CODE_LANGUAGE,
);
const title = computed(() =>
  props.title ? processText(props.title) : undefined,
);
const showSkeleton = computed(() => isLoading.value && !data.value);
const notFound = computed(() =>
  isLoading.value ? null : readFetchNotFound(error.value),
);

const hasError = computed(
  () =>
    !isLoading.value && !data.value && Boolean(error.value) && !notFound.value,
);

const { t } = useI18n();
</script>

<template>
  <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
  <DmsBlockStatus
    v-else-if="notFound"
    state="not-found"
    :not-found="notFound"
  />
  <div
    v-else-if="showSkeleton"
    class="border-default grid gap-2 rounded-[10px] border px-3.5 py-3"
    aria-busy="true"
  >
    <USkeleton
      :aria-label="t('dms.a11y.loading')"
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
