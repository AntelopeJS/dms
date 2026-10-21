<script setup lang="ts">
import { computed, useId } from "vue";
import DmsBlockStatus from "../../build/components/blocks/BlockStatus.vue";
import DmsProseTokens from "../../build/components/prose/ProseTokens";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";
import { parseProse, pickLocaleText } from "../../build/utils/markdown";
import { useWatch } from "#dms-core/app/composables/watch/useWatch";
// Relative: defineProps extends it, and the SFC compiler resolves no alias.
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

/** What the block's data source answers (interface-dms `ProseResponse`). */
interface ProseResponse {
  markdown?: string;
}

// `Prose` block (interface-dms `base/prose`): long-form Markdown written in
// the options — as is, behind a `$` i18n key, or one text per locale — or
// read from a route answering `{ markdown }` in the reader's language.
// `parseProse` reads it and DmsProseTokens draws it, on the server as in the
// browser, so the hydrated page keeps the server's layout.
interface ProseBlockProps extends Partial<DefaultComponentProps> {
  /** Markdown, a `$` i18n key, or `{ locale: markdown }`. */
  content?: string | Record<string, string>;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Lists the `##` and `###` headings beside or above the text. */
  toc?: boolean;
  /** `readable` keeps lines near 72 characters; `wide` takes the page width. */
  width?: "readable" | "wide";
}

const props = withDefaults(defineProps<ProseBlockProps>(), {
  content: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  toc: false,
  width: "readable",
});

// The placeholder lines while the route answers.
const SKELETON_LINE_WIDTHS = ["w-1/3", "w-full", "w-11/12", "w-4/5", "w-2/3"];

const { t, locale, fallbackLocale } = useI18n();
const { processI18n } = useTranslation();
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

// The reader's language is part of what the route is asked for: switching it
// asks again, in the new language.
const { data, isLoading, error, refresh } = useChartFetch<ProseResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
  watchSource: () => [locale.value, JSON.stringify(watchState.value)],
});

function readContent(): string {
  const content = props.content;
  if (!content) return "";
  if (typeof content !== "string") {
    const fallback =
      typeof fallbackLocale.value === "string"
        ? fallbackLocale.value
        : undefined;
    return pickLocaleText(content, locale.value, fallback);
  }
  return content.startsWith("$") ? processI18n(content) : content;
}

const markdown = computed(() => data.value?.markdown ?? readContent());
const parsed = computed(() => parseProse(markdown.value));
const headings = computed(() => (props.toc ? parsed.value.headings : []));
const hasToc = computed(() => headings.value.length > 0);
const tocTitleId = useId();

const showSkeleton = computed(() => isLoading.value && !data.value);
const notFound = computed(() =>
  isLoading.value ? null : readFetchNotFound(error.value),
);
// A failed first load shows a retry in place of the text; a failed refetch
// keeps the text on screen.
const hasError = computed(
  () =>
    !isLoading.value && !data.value && Boolean(error.value) && !notFound.value,
);

const MEASURE_CLASS = "max-w-[72ch]";
const layoutClass = computed(() => {
  if (!hasToc.value) return props.width === "wide" ? "" : MEASURE_CLASS;
  return props.width === "wide"
    ? "lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-10"
    : "lg:grid lg:grid-cols-[minmax(0,72ch)_13rem] lg:gap-10";
});
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
    class="grid gap-3"
    :class="MEASURE_CLASS"
    aria-busy="true"
  >
    <USkeleton
      v-for="lineWidth in SKELETON_LINE_WIDTHS"
      :key="lineWidth"
      :aria-label="t('dms.a11y.loading')"
      class="h-3.5"
      :class="lineWidth"
    />
  </div>
  <div v-else-if="markdown" :class="layoutClass" data-dms-prose>
    <nav
      v-if="hasToc"
      :aria-labelledby="tocTitleId"
      class="border-default mb-6 rounded-[10px] border px-4 py-3 lg:sticky lg:top-4 lg:order-last lg:mb-0 lg:self-start lg:rounded-none lg:border-0 lg:border-s lg:py-1"
    >
      <p
        :id="tocTitleId"
        class="text-dimmed mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase"
      >
        {{ t("dms.prose.toc") }}
      </p>
      <ul class="space-y-1.5 text-[13px]">
        <li
          v-for="heading in headings"
          :key="heading.id"
          :class="heading.level === 3 ? 'ps-3' : ''"
        >
          <a
            :href="`#${heading.id}`"
            class="text-muted hover:text-highlighted focus-visible:text-highlighted"
          >
            {{ heading.text }}
          </a>
        </li>
      </ul>
    </nav>
    <article class="text-default min-w-0 text-[15px] leading-7">
      <DmsProseTokens :tokens="parsed.tokens" />
    </article>
  </div>
</template>
