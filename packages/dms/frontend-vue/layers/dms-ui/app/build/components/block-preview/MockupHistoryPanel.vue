<script setup lang="ts">
import { computed } from "vue";
import { formatRelativeDate } from "../../utils/relativeDate";
import type {
  MockupVersionAuthor,
  MockupVersionListEntry,
} from "../../utils/mockupVersions";

/**
 * The right-hand panel of a mockup's versions, newest first: when each was
 * written, by whom, what it changed, and how many comments were pinned on it.
 * Picking one previews it read-only in the canvas; the newest one is the
 * mockup as it is, so it leaves the preview instead.
 */
const props = defineProps<{
  versions: readonly MockupVersionListEntry[];
  /** The number of the version the canvas previews. */
  previewing?: number;
  isLoading: boolean;
  hasFailed: boolean;
}>();
const emit = defineEmits<{
  preview: [seq: number];
  current: [];
  close: [];
}>();

const AUTHOR_KEYS: Record<MockupVersionAuthor, string> = {
  ai: "dms.mockup.history_by_ai",
  you: "dms.mockup.history_by_you",
  disk: "dms.mockup.history_by_disk",
};

const { t, locale } = useI18n();
const newest = computed(() => props.versions[0]?.seq);

function commentsLabel(count: number): string {
  return t("dms.mockup.history_comments", { count }, count);
}

function pick(seq: number): void {
  if (seq === newest.value) emit("current");
  else emit("preview", seq);
}
</script>

<template>
  <aside
    class="border-default bg-default flex min-h-0 flex-col border-s"
    :aria-label="t('dms.mockup.history')"
    data-dms-mockup-history-panel
  >
    <header class="border-default flex items-center gap-2 border-b px-3 py-2">
      <h2 class="text-highlighted flex-1 text-sm font-semibold">
        {{ t("dms.mockup.history") }}
      </h2>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-ph-x"
        :aria-label="t('dms.mockup.history_close')"
        data-dms-mockup-history-close
        @click="emit('close')"
      />
    </header>
    <p
      v-if="hasFailed"
      class="text-error px-3 py-2 text-xs"
      role="alert"
      data-dms-mockup-history-failed
    >
      {{ t("dms.mockup.history_failed") }}
    </p>
    <p
      v-else-if="!versions.length && !isLoading"
      class="text-muted px-3 py-2 text-xs"
      data-dms-mockup-history-empty
    >
      {{ t("dms.mockup.history_empty") }}
    </p>
    <ul class="min-h-0 flex-1 overflow-y-auto p-1" data-dms-mockup-versions>
      <li v-for="version in versions" :key="version.seq">
        <button
          type="button"
          class="hover:bg-elevated focus-visible:ring-primary flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-start text-xs outline-none focus-visible:ring-2"
          :class="{ 'bg-elevated': version.seq === previewing }"
          :aria-pressed="
            version.seq === previewing ||
            (previewing === undefined && version.seq === newest)
          "
          :data-dms-mockup-version="version.seq"
          @click="pick(version.seq)"
        >
          <span class="text-default font-medium">{{ version.summary }}</span>
          <span class="text-muted flex flex-wrap items-center gap-x-1.5">
            <span>{{ t(AUTHOR_KEYS[version.by]) }}</span>
            <span aria-hidden="true">·</span>
            <time :datetime="version.at">
              {{ formatRelativeDate(version.at, locale) }}
            </time>
            <span v-if="version.seq === newest" class="text-primary">
              · {{ t("dms.mockup.history_current") }}
            </span>
            <span
              v-if="version.comments"
              class="ms-auto flex items-center gap-1"
              :title="commentsLabel(version.comments)"
              :data-dms-mockup-version-comments="version.comments"
            >
              <UIcon
                name="i-ph-chat-circle-dots"
                class="size-3.5"
                aria-hidden="true"
              />
              <span aria-hidden="true">{{ version.comments }}</span>
              <span class="sr-only">{{ commentsLabel(version.comments) }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>
