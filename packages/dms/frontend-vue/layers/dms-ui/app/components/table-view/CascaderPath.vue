<script setup lang="ts">
import {
  buildCascaderPathLabels,
  CASCADER_FETCH_LIMIT,
  CASCADER_PATH_SEPARATOR,
  resolveCascaderKeyMapping,
  type CascaderKeyMapping,
} from "../../utils/cascader";

const DEFAULT_VALUE_KEY = "_id";

interface CascaderPathProps {
  value: unknown;
  searchUrl?: string;
  keyMapping?: Partial<CascaderKeyMapping>;
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

const valueObject = computed(() =>
  isObject(props.value) ? (props.value as Record<string, unknown>) : undefined,
);

const valueId = computed(() => {
  const raw = valueObject.value
    ? valueObject.value[keyMapping.value.value]
    : props.value;
  return raw === undefined || raw === null ? undefined : String(raw);
});

const ownLabel = computed(() => {
  const label = valueObject.value?.[keyMapping.value.label];
  return label === undefined || label === null ? undefined : String(label);
});

const { data } = await useDmsAsyncData(
  `cascader-path-${props.searchUrl}`,
  () =>
    props.searchUrl
      ? $authFetch<CascaderResponse>(props.searchUrl, {
          params: { limit: CASCADER_FETCH_LIMIT },
        })
      : Promise.resolve(undefined),
  { lazy: true },
);

const pathLabel = computed(() => {
  if (!valueId.value) return ownLabel.value ?? "";
  const rows = data.value?.results;
  if (rows) {
    const labels = buildCascaderPathLabels(
      rows,
      keyMapping.value,
      valueId.value,
    );
    if (labels.length > 0) return labels.join(CASCADER_PATH_SEPARATOR);
  }
  return ownLabel.value ?? valueId.value;
});
</script>

<template>
  <span class="truncate" :title="pathLabel">{{ pathLabel }}</span>
</template>
