<script setup lang="ts">
import { computed } from "vue";
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import type { MockupSource, MockupSummary } from "../utils/mockup";
import { badgeOf, stageOf } from "../utils/mockupCard";
import MockupThumbnail from "./MockupThumbnail.vue";

/**
 * One mockup of the Mockups page: its first page drawn full, its title and
 * stage, when it last changed, where it came from, its open comments, and a
 * menu to open, rename, copy or delete it. The whole card opens the viewer,
 * and a built mockup lists the real pages it made, each a link of its own.
 */
const props = defineProps<{
  mockup: MockupSummary;
  /** The path of the page being turned back into its mockup, while it is. */
  resyncing?: string;
}>();

const emit = defineEmits<{
  open: [];
  rename: [];
  duplicate: [];
  delete: [];
  resync: [path: string];
}>();

const VIEWER_PATH = "/mockup";
const META_SEPARATOR = " · ";
const SOURCE_KEYS: Record<MockupSource, string> = {
  chat: "dms.mockup.source_chat",
  "claude-code": "dms.mockup.source_claude_code",
  codex: "dms.mockup.source_codex",
};

const { t, locale } = useI18n();

const badge = computed(() => badgeOf(stageOf(props.mockup)));
const label = computed(() => props.mockup.title || props.mockup.name);
const viewerLink = computed(
  () => `${VIEWER_PATH}?name=${encodeURIComponent(props.mockup.name)}`,
);
const updated = computed(() =>
  t("dms.mockup.card_updated", {
    time: formatRelativeTime(props.mockup.updatedAt, t, locale.value),
  }),
);
const updatedExact = computed(() =>
  new Date(props.mockup.updatedAt).toLocaleString(locale.value),
);
const meta = computed(() => {
  const { pages, source } = props.mockup;
  const parts = [t("dms.mockup.card_pages", { count: pages }, pages)];
  if (source) {
    parts.push(
      t("dms.mockup.card_source", { source: t(SOURCE_KEYS[source]) }),
    );
  }
  return parts.join(META_SEPARATOR);
});

const menu = computed(() => [
  [
    {
      label: t("dms.mockup.card_open"),
      icon: "i-lucide-external-link",
      onSelect: () => emit("open"),
    },
  ],
  [
    {
      label: t("dms.mockup.card_rename"),
      icon: "i-lucide-pencil",
      onSelect: () => emit("rename"),
    },
    {
      label: t("dms.mockup.card_duplicate"),
      icon: "i-lucide-copy",
      onSelect: () => emit("duplicate"),
    },
  ],
  [
    {
      label: t("dms.mockup.remove"),
      icon: "i-lucide-trash-2",
      color: "error" as const,
      onSelect: () => emit("delete"),
    },
  ],
]);
</script>

<template>
  <li
    class="bg-default ring-default hover:ring-accented focus-within:ring-primary relative flex flex-col overflow-hidden rounded-lg ring-1 transition-shadow"
    :data-dms-mockup-card="mockup.name"
  >
    <MockupThumbnail :name="mockup.name" />
    <div class="flex flex-1 flex-col gap-2 p-3.5">
      <div class="flex items-start gap-2">
        <h3 class="min-w-0 flex-1 truncate pt-0.5 text-sm font-semibold">
          <DmsLink
            :to="viewerLink"
            class="text-highlighted outline-none after:absolute after:inset-0"
            data-dms-mockup-open
          >
            {{ label }}
          </DmsLink>
        </h3>
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="xs"
            class="relative -mt-0.5 -mr-1.5"
            :aria-label="t('dms.mockup.card_actions', { name: label })"
            data-dms-mockup-menu
          />
        </UDropdownMenu>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge
          :color="badge.color"
          variant="subtle"
          size="sm"
          data-dms-mockup-status
        >
          {{ t(`dms.mockup.${badge.key}`, badge.params ?? {}) }}
        </UBadge>
        <UBadge
          v-if="mockup.openComments > 0"
          color="primary"
          variant="subtle"
          size="sm"
          icon="i-lucide-message-square"
          data-dms-mockup-comments
        >
          {{
            t(
              "dms.mockup.card_comments",
              { count: mockup.openComments },
              mockup.openComments,
            )
          }}
        </UBadge>
      </div>
      <p class="text-muted text-xs" data-dms-mockup-meta>{{ meta }}</p>
      <p class="text-dimmed text-xs">
        <time
          :datetime="mockup.updatedAt"
          :title="updatedExact"
          data-dms-mockup-updated
          v-text="updated"
        />
      </p>
      <ul
        v-if="mockup.status === 'built'"
        class="border-default mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t pt-2.5"
        :aria-label="t('dms.mockup.built_pages')"
      >
        <li
          v-for="page in mockup.builtPages"
          :key="page.path"
          class="flex items-center gap-1"
        >
          <DmsLink
            :to="page.path"
            class="text-primary relative text-xs hover:underline"
            data-dms-mockup-page
          >
            {{ page.title }}
          </DmsLink>
          <button
            v-if="page.changed && page.pageId"
            type="button"
            class="text-warning relative text-xs hover:underline disabled:opacity-50"
            :disabled="resyncing !== undefined"
            :title="t('dms.mockup.resync_hint')"
            data-dms-mockup-resync
            @click="emit('resync', page.path)"
          >
            {{ t("dms.mockup.resync") }}
          </button>
        </li>
      </ul>
    </div>
  </li>
</template>
