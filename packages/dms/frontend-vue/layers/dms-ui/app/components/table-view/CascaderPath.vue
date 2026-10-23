<script setup lang="ts">
import {
  CASCADER_PATH_SEPARATOR,
  cascaderValueId,
  cascaderValuePath,
  cascaderValueReads,
  readCascaderAncestry,
  resolveCascaderKeyMapping,
  type CascaderKeyMapping,
} from "../../utils/cascader";
import { MAX_RELATION_BADGES } from "../../build/composables/data-types/relationBadges";
import { useRelationRows } from "../../build/composables/data-types/relationRows";

const DEFAULT_VALUE_KEY = "_id";

interface CascaderPathProps {
  /** One picked value, or the list a multiple cascader holds. */
  value: unknown;
  searchUrl?: string;
  keyMapping?: Partial<CascaderKeyMapping>;
}

/**
 * A picked value as the cell names it: its path, or "Not found" with its id
 * on hover when its row is gone or out of reach.
 */
interface CascaderBadge {
  label: string;
  title: string;
  isNotFound: boolean;
}

const props = defineProps<CascaderPathProps>();

const { t } = useI18n();
const { readRelationRows } = useRelationRows();

const keyMapping = computed(() =>
  resolveCascaderKeyMapping({
    value: DEFAULT_VALUE_KEY,
    ...props.keyMapping,
  }),
);

const values = computed<unknown[]>(() =>
  Array.isArray(props.value) ? props.value : [props.value],
);
const reads = computed(() =>
  cascaderValueReads(values.value, keyMapping.value),
);
const ids = computed(() => reads.value.idsToRead);

// The ids a list did not join (and the parents of those it did), with their
// ancestors, read by `?ids=` level by level.
const { data } = await useDmsAsyncData(
  () => `cascader-path-${props.searchUrl}-${ids.value.join(",")}`,
  () =>
    props.searchUrl && ids.value.length > 0
      ? readCascaderAncestry(
          (pending) =>
            readRelationRows(
              {
                searchUrl: props.searchUrl!,
                keyMapping: { value: keyMapping.value.value },
              },
              pending,
            ),
          keyMapping.value,
          ids.value,
        )
      : Promise.resolve(undefined),
  // The labels of a path, not the page's data.
  { lazy: true, refreshOnPageRefresh: false },
);

const pathRows = computed(() => [
  ...reads.value.joinedRows,
  ...(data.value?.rows ?? []),
]);

const notFound = computed(() => new Set(data.value?.notFound));

function badgeOf(item: unknown): CascaderBadge | undefined {
  const id = cascaderValueId(item, keyMapping.value);
  if (id !== undefined && notFound.value.has(id)) {
    return {
      label: t("dms.form.relation.not_found"),
      title: id,
      isNotFound: true,
    };
  }
  const path = cascaderValuePath(item, keyMapping.value, pathRows.value);
  if (path.length === 0) return undefined;
  return {
    label: path.at(-1) ?? "",
    title: path.join(CASCADER_PATH_SEPARATOR),
    isNotFound: false,
  };
}

const single = computed(() => {
  const badge = badgeOf(props.value);
  if (!badge || badge.isNotFound) return badge;
  return { ...badge, label: badge.title };
});

const badges = computed<CascaderBadge[]>(() =>
  (Array.isArray(props.value) ? props.value : [])
    .map(badgeOf)
    .filter((badge): badge is CascaderBadge => !!badge),
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
      :class="badge.isNotFound && 'text-muted'"
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
  <span
    v-else-if="single"
    :class="['truncate', single.isNotFound && 'text-muted']"
    :title="single.title"
  >
    {{ single.label }}
  </span>
</template>
