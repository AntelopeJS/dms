<script setup lang="ts">
import { computed } from "vue";
import type { TableViewDisplayContext } from "../../composables/table-view/types";
import DmsEmpty from "../components/table/Empty.vue";
import DmsPagination from "../components/table/Pagination.vue";
import {
  parseMockupSummary,
  type MockupSource,
  type MockupSummary,
} from "../utils/mockup";
import MockupThumbnail from "./MockupThumbnail.vue";

/**
 * The display of the Mockups page: one card per mockup, with a thumbnail of
 * its first page, its status, where it came from and the open comments. The
 * whole card opens the mockup's viewer, and a built mockup lists the real
 * pages it made, each a link of its own.
 */
const props = defineProps<{ context: TableViewDisplayContext }>();

const SKELETON_COUNT = 3;
const VIEWER_PATH = "/mockup";
const META_SEPARATOR = " · ";
const SOURCE_KEYS: Record<MockupSource, string> = {
  chat: "dms.mockup.source_chat",
  "claude-code": "dms.mockup.source_claude_code",
  codex: "dms.mockup.source_codex",
};

const { t } = useI18n();

const mockups = computed(() =>
  props.context.items.flatMap((row) => parseMockupSummary(row) ?? []),
);

function viewerLink(name: string): string {
  return `${VIEWER_PATH}?name=${encodeURIComponent(name)}`;
}

function metaLine(mockup: MockupSummary): string {
  const parts = [
    t("dms.mockup.card_pages", { count: mockup.pages }, mockup.pages),
  ];
  if (mockup.source) {
    parts.push(
      t("dms.mockup.card_source", { source: t(SOURCE_KEYS[mockup.source]) }),
    );
  }
  if (mockup.openComments > 0) {
    parts.push(
      t(
        "dms.mockup.card_comments",
        { count: mockup.openComments },
        mockup.openComments,
      ),
    );
  }
  return parts.join(META_SEPARATOR);
}
</script>

<template>
  <div>
    <ul
      v-if="context.firstPageLoading"
      class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
    >
      <li
        v-for="index in SKELETON_COUNT"
        :key="index"
        class="ring-default overflow-hidden rounded-lg ring-1"
      >
        <USkeleton class="h-[84px] rounded-none" />
        <div class="space-y-2 p-3.5">
          <USkeleton class="h-4 w-2/3" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </li>
    </ul>

    <DmsEmpty v-else-if="!mockups.length" :can-add-row="false" />

    <ul
      v-else
      class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3"
      data-dms-mockup-cards
    >
      <li
        v-for="mockup in mockups"
        :key="mockup.name"
        class="bg-default ring-default hover:ring-accented focus-within:ring-primary relative flex flex-col overflow-hidden rounded-lg ring-1 transition-shadow"
        :data-dms-mockup-card="mockup.name"
      >
        <MockupThumbnail :name="mockup.name" />
        <div class="flex flex-1 flex-col gap-1.5 p-3.5">
          <div class="flex items-center gap-2">
            <h3 class="min-w-0 flex-1 truncate text-sm font-semibold">
              <DmsLink
                :to="viewerLink(mockup.name)"
                class="text-highlighted outline-none after:absolute after:inset-0"
                data-dms-mockup-open
              >
                {{ mockup.title || mockup.name }}
              </DmsLink>
            </h3>
            <UBadge
              :color="mockup.status === 'built' ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
              data-dms-mockup-status
            >
              {{
                mockup.status === "built"
                  ? t("dms.mockup.status_built")
                  : t("dms.mockup.status_draft")
              }}
            </UBadge>
          </div>
          <p class="text-muted text-xs" data-dms-mockup-meta>
            {{ metaLine(mockup) }}
          </p>
          <ul
            v-if="mockup.status === 'built'"
            class="flex flex-wrap gap-x-3 gap-y-1 pt-1"
            :aria-label="t('dms.mockup.built_pages')"
          >
            <li v-for="page in mockup.builtPages" :key="page.path">
              <DmsLink
                :to="page.path"
                class="text-primary relative text-xs hover:underline"
                data-dms-mockup-page
              >
                {{ page.title }}
              </DmsLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <DmsPagination />
  </div>
</template>
