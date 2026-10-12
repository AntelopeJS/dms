<script setup lang="ts">
import { computed } from "vue";
import {
  type FetchNotFound,
  NOT_FOUND_TITLE_KEY,
} from "../../utils/fetchNotFound";

// The one-line status a compact block (a KPI card, a meter) shows in place of
// its value: a first load that failed, with a retry, or a source that
// answered 404 — nothing to retry there, the value does not exist.
interface BlockInlineStatusProps {
  state: "error" | "not-found";
  /** What the 404 said; its `emptyState.title` replaces the default text. */
  notFound?: FetchNotFound | null;
}

interface BlockInlineStatusEmits {
  (e: "retry"): void;
}

const props = withDefaults(defineProps<BlockInlineStatusProps>(), {
  notFound: undefined,
});
const emit = defineEmits<BlockInlineStatusEmits>();

const NOT_FOUND_ICON = "i-ph-magnifying-glass";
const ERROR_ICON = "i-ph-warning-circle";

const { t } = useI18n();
const { processI18n } = useTranslation();

const isError = computed(() => props.state === "error");
const label = computed(() => {
  if (isError.value) return t("dms.table.load_error_title");
  const title = props.notFound?.emptyState?.title;
  return title ? processI18n(title) : t(NOT_FOUND_TITLE_KEY);
});
const icon = computed(() =>
  isError.value
    ? ERROR_ICON
    : (props.notFound?.emptyState?.icon ?? NOT_FOUND_ICON),
);
</script>

<template>
  <div
    class="flex items-center justify-between gap-2"
    :role="isError ? 'alert' : 'status'"
  >
    <p
      class="flex min-w-0 items-center gap-1.5 text-[12.5px]"
      :class="isError ? 'text-error' : 'text-muted'"
    >
      <UIcon :name="icon" class="size-4 shrink-0" />
      <span class="truncate">{{ label }}</span>
    </p>
    <UButton
      v-if="isError"
      :label="t('dms.table.load_error_retry')"
      icon="i-ph-arrows-clockwise"
      color="neutral"
      variant="outline"
      size="xs"
      @click="emit('retry')"
    />
  </div>
</template>
