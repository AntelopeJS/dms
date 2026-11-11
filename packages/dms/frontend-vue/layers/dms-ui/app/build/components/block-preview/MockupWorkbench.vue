<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { usePreviewFrame } from "../../composables/block-preview/usePreviewFrame";
import { useMockupSession } from "../../composables/block-preview/useMockupSession";
import {
  isPreviewTheme,
  previewInspectMessage,
  previewRenderMessage,
} from "../../utils/blockPreview";
import {
  MOCKUP_WIDTH_OPTIONS,
  MOCKUP_WIDTHS,
  specPointerFor,
  type MockupWidth,
} from "../../utils/mockup";
import { currentSketchScheme } from "../../utils/sketch";
import MockupAnnotations from "./MockupAnnotations.vue";
import MockupIssues from "./MockupIssues.vue";

/**
 * One mockup, live: the page's tree drawn by the real block preview in an
 * iframe, redrawn through `postMessage` on each save of the spec, with the
 * spec's issues and notes beside it. In annotate mode a click on a block of
 * the preview opens a note on the spec node it comes from.
 */
const props = defineProps<{
  name: string;
  initialPage?: string;
  initialWidth?: MockupWidth;
}>();

const PREVIEW_PATH = "/dms-preview";
const NOTE_MAX_LENGTH = 2000;
const FRAME_MIN_HEIGHT_PX = 240;

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const config = useDmsRuntimeConfig();

const session = useMockupSession({
  name: props.name,
  baseURL: config.public.dms?.baseURL?.replace(/\/+$/, "") ?? "",
  authFetch: $authFetch,
});
const { state, annotations, isConnected, hasRequestFailed } = session;

const previewElement = useTemplateRef<HTMLIFrameElement>("preview");
const requestedPage = ref(props.initialPage);
const width = ref<MockupWidth>(props.initialWidth ?? "desktop");
const isAnnotating = ref(false);
const note = ref("");
const pending = ref<{ page: string; path: string }>();
const isSelectionUnknown = ref(false);

const pages = computed(() => state.value?.pages ?? []);
const issues = computed(() => state.value?.issues ?? []);
const currentPage = computed(
  () =>
    pages.value.find((entry) => entry.id === requestedPage.value) ??
    pages.value[0],
);

function syncPreview(): void {
  const page = currentPage.value;
  if (!page) return;
  bridge.post(
    previewRenderMessage({
      tree: page.tree,
      theme: isPreviewTheme(page.options.theme)
        ? page.options.theme
        : currentSketchScheme(),
      locale: page.options.locale,
    }),
  );
  bridge.post(previewInspectMessage(isAnnotating.value));
}

function openNote(layoutPath: string): void {
  const page = currentPage.value;
  if (!isAnnotating.value || !page) return;
  const path = specPointerFor(page, layoutPath);
  isSelectionUnknown.value = path === undefined;
  if (path === undefined) return;
  note.value = "";
  pending.value = { page: page.id, path };
}

const bridge = usePreviewFrame({
  frame: previewElement,
  onReady: syncPreview,
  onSelect: openNote,
});

watch([state, () => currentPage.value?.id], syncPreview);
watch(isAnnotating, (enabled) => {
  bridge.post(previewInspectMessage(enabled));
  pending.value = undefined;
  isSelectionUnknown.value = false;
});

async function saveNote(): Promise<void> {
  const target = pending.value;
  const text = note.value.trim();
  if (!target || !text) return;
  await session.addAnnotation({ ...target, text });
  if (!hasRequestFailed.value) pending.value = undefined;
}

const previewStyle = computed(() => ({
  width: `${MOCKUP_WIDTHS[width.value]}px`,
  maxWidth: "100%",
  height: `${Math.max(bridge.height.value ?? 0, FRAME_MIN_HEIGHT_PX)}px`,
}));
</script>

<template>
  <div class="space-y-4" data-dms-mockup-viewer>
    <header class="flex flex-wrap items-center gap-2">
      <h1 class="text-highlighted mr-2 text-base font-semibold">
        {{ state?.title || name }}
      </h1>
      <div
        class="flex flex-wrap gap-1"
        role="group"
        :aria-label="t('dms.mockup.pages')"
      >
        <UButton
          v-for="entry in pages"
          :key="entry.id"
          size="sm"
          color="neutral"
          :variant="entry.id === currentPage?.id ? 'solid' : 'ghost'"
          :aria-pressed="entry.id === currentPage?.id"
          data-dms-mockup-page
          @click="requestedPage = entry.id"
        >
          {{ entry.title }}
        </UButton>
      </div>
      <div class="flex gap-1" role="group" :aria-label="t('dms.mockup.width')">
        <UButton
          v-for="option in MOCKUP_WIDTH_OPTIONS"
          :key="option"
          size="sm"
          color="neutral"
          :variant="option === width ? 'solid' : 'ghost'"
          :aria-pressed="option === width"
          data-dms-mockup-width
          @click="width = option"
        >
          {{ t(`dms.mockup.width_${option}`) }}
        </UButton>
      </div>
      <UButton
        size="sm"
        color="primary"
        icon="i-ph-chat-circle-text"
        :variant="isAnnotating ? 'solid' : 'outline'"
        :aria-pressed="isAnnotating"
        data-dms-mockup-annotate
        @click="isAnnotating = !isAnnotating"
      >
        {{ t("dms.mockup.annotate") }}
      </UButton>
      <UBadge
        :color="issues.length ? 'warning' : 'success'"
        variant="subtle"
        data-dms-mockup-issue-count
      >
        {{ t("dms.mockup.issues", { count: issues.length }) }}
      </UBadge>
      <span
        v-if="!isConnected"
        class="text-muted text-xs"
        data-dms-mockup-disconnected
      >
        {{ t("dms.mockup.disconnected") }}
      </span>
    </header>

    <UAlert
      v-if="isSelectionUnknown"
      color="warning"
      variant="subtle"
      icon="i-ph-warning"
      :title="t('dms.mockup.not_in_spec')"
    />
    <UAlert
      v-if="hasRequestFailed"
      color="error"
      variant="subtle"
      icon="i-ph-warning-circle"
      :title="t('dms.mockup.request_failed')"
    />

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="min-w-0 overflow-x-auto">
        <p v-if="!pages.length" class="text-muted text-sm">
          {{ t("dms.mockup.waiting") }}
        </p>
        <iframe
          v-show="pages.length"
          ref="preview"
          class="border-default bg-default mx-auto block rounded-md border"
          :src="PREVIEW_PATH"
          :title="t('dms.mockup.frame_title')"
          :style="previewStyle"
        />
      </div>
      <aside class="space-y-4">
        <div
          v-if="pending"
          class="border-default space-y-2 rounded-md border p-3"
          data-dms-mockup-compose
        >
          <code class="text-muted block text-xs break-all">
            {{ pending.path }}
          </code>
          <UTextarea
            v-model="note"
            class="w-full"
            :rows="3"
            :maxlength="NOTE_MAX_LENGTH"
            :placeholder="t('dms.mockup.note_placeholder')"
          />
          <div class="flex gap-2">
            <UButton
              size="sm"
              :disabled="!note.trim()"
              data-dms-mockup-save
              @click="saveNote"
            >
              {{ t("dms.mockup.save") }}
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              @click="pending = undefined"
            >
              {{ t("dms.mockup.cancel") }}
            </UButton>
          </div>
        </div>
        <p v-else-if="isAnnotating" class="text-muted text-sm">
          {{ t("dms.mockup.annotate_hint") }}
        </p>
        <MockupIssues :issues="issues" />
        <MockupAnnotations
          :annotations="annotations"
          @status="session.setAnnotationStatus"
        />
      </aside>
    </div>
  </div>
</template>
