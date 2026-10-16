<script setup lang="ts">
import {
  CASCADER_FETCH_LIMIT,
  CASCADER_PATH_SEPARATOR,
  cascaderValuePath,
  resolveCascaderKeyMapping,
  type CascaderKeyMapping,
} from "../../utils/cascader";
import { MAX_RELATION_BADGES } from "../../build/composables/data-types/relationBadges";

const DEFAULT_VALUE_KEY = "_id";

interface CascaderPathProps {
  /** One picked value, or the list a multiple cascader holds. */
  value: unknown;
  searchUrl?: string;
  keyMapping?: Partial<CascaderKeyMapping>;
}

/** A picked value of a multiple cascader: its name, its path on hover. */
interface CascaderBadge {
  label: string;
  title: string;
}

const props = defineProps<CascaderPathProps>();

const { $authFetch } = useAuthFetch();

interface CascaderResponse {
  results: Record<string, unknown>[];
  total: number;
}

const keyMapping = computed(() =>
  resolveCascaderKeyMapping({
    value: DEFAULT_VALUE_KEY,
    ...props.keyMapping,
  }),
);

const { data } = await useDmsAsyncData(
  `cascader-path-${props.searchUrl}`,
  () =>
    props.searchUrl
      ? $authFetch<CascaderResponse>(props.searchUrl, {
          params: { limit: CASCADER_FETCH_LIMIT },
        })
      : Promise.resolve(undefined),
  // The labels of a path, not the page's data.
  { lazy: true, refreshOnPageRefresh: false },
);

const pathOf = (item: unknown): string[] =>
  cascaderValuePath(item, keyMapping.value, data.value?.results);

const pathLabel = computed(() =>
  pathOf(props.value).join(CASCADER_PATH_SEPARATOR),
);

const badges = computed<CascaderBadge[]>(() =>
  (Array.isArray(props.value) ? props.value : [])
    .map(pathOf)
    .filter((path) => path.length > 0)
    .map((path) => ({
      label: path.at(-1) ?? "",
      title: path.join(CASCADER_PATH_SEPARATOR),
    })),
);
const visibleBadges = computed(() =>
  badges.value.slice(0, MAX_RELATION_BADGES),
);
const hiddenBadges = computed(() => badges.value.slice(MAX_RELATION_BADGES));
</script>

<template>
  <span
    v-if="Array.isArray(props.value)"
    class="inline-flex flex-wrap items-center gap-1"
  >
    <UBadge
      v-for="badge in visibleBadges"
      :key="badge.title"
      :label="badge.label"
      :title="badge.title"
      color="neutral"
      variant="subtle"
      size="sm"
      class="max-w-40"
    />
    <UBadge
      v-if="hiddenBadges.length"
      :label="`+${hiddenBadges.length}`"
      :title="hiddenBadges.map((badge) => badge.title).join(', ')"
      color="neutral"
      variant="subtle"
      size="sm"
    />
  </span>
  <span v-else class="truncate" :title="pathLabel">{{ pathLabel }}</span>
</template>
