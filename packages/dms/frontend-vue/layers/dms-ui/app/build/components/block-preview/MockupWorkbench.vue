<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { useResizeObserver } from "@vueuse/core";
import { useMockupCatalog } from "../../composables/block-preview/useMockupCatalog";
import { useMockupComments } from "../../composables/block-preview/useMockupComments";
import { useMockupEditing } from "../../composables/block-preview/useMockupEditing";
import { useMockupHandoff } from "../../composables/block-preview/useMockupHandoff";
import { useMockupSession } from "../../composables/block-preview/useMockupSession";
import {
  useMockupSpec,
  type MockupSpecNotice,
} from "../../composables/block-preview/useMockupSpec";
import { usePreviewFrame } from "../../composables/block-preview/usePreviewFrame";
import { isPreviewTheme } from "../../utils/blockPreview";
import {
  previewInspectMessage,
  previewRenderMessage,
  type PreviewNavigation,
} from "../../utils/blockPreviewMessages";
import {
  MOCKUP_WIDTHS,
  type MockupMode,
  type MockupWidth,
} from "../../utils/mockup";
import { blockName, nodeLabel, outlineRows } from "../../utils/mockupOutline";
import { layoutPathOf, nodeAt, pageIndexOf } from "../../utils/mockupSpec";
import { currentSketchScheme } from "../../utils/sketch";
import MockupBlockCatalog from "./MockupBlockCatalog.vue";
import MockupCommentPanel from "./MockupCommentPanel.vue";
import MockupEditOverlay from "./MockupEditOverlay.vue";
import MockupEditPanel from "./MockupEditPanel.vue";
import MockupInspector from "./MockupInspector.vue";
import MockupPromptModal from "./MockupPromptModal.vue";
import MockupTopBar from "./MockupTopBar.vue";

/**
 * One mockup, live, in two modes. Comment leaves notes on the blocks for the
 * AI. Edit changes the spec in place: select, add, move, duplicate, remove
 * and restyle blocks, edit pages, each edit written to `spec.json` at once,
 * with undo and redo. The page is drawn by the real block preview in an
 * iframe, inside the sidebar of the mockup's pages; data wiring is never
 * edited here, but handed to the AI.
 */
const props = defineProps<{
  name: string;
  initialPage?: string;
  initialWidth?: MockupWidth;
  initialMode?: MockupMode;
}>();

const PREVIEW_PATH = "/dms-preview";
const FRAME_MIN_HEIGHT_PX = 240;
const HOME_ICON = "i-ph-house-light";
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const PROMPT_KEYS = {
  "connect-data": "dms.mockup.prompt_connect_data",
  "custom-zone": "dms.mockup.prompt_custom_zone",
} as const;

const { t } = useI18n();
const toast = useToast();
const { presentError } = useApiErrorPresenter();
const { $authFetch } = useAuthFetch();
const config = useDmsRuntimeConfig();

const session = useMockupSession({
  name: props.name,
  baseURL: config.public.dms?.baseURL?.replace(/\/+$/, "") ?? "",
  authFetch: $authFetch,
});
const { state, annotations, isConnected, hasRequestFailed } = session;

function notify(notice: MockupSpecNotice): void {
  if (notice.kind === "adopted") {
    toast.add({ color: "info", title: t("dms.mockup.adopted") });
  } else if (notice.kind === "refused") {
    toast.add({
      color: "warning",
      title: t("dms.mockup.refused"),
      description: `${notice.issue.path}: ${notice.issue.message}`,
    });
  } else {
    presentError(notice.error, { fallbackKey: "dms.mockup.save_failed" });
  }
}

const editor = useMockupSpec({
  name: props.name,
  authFetch: $authFetch,
  state,
  onNotice: notify,
});
const catalog = useMockupCatalog($authFetch);
const handoff = useMockupHandoff({
  mockup: props.name,
  buildCommand: (name) => t("dms.mockup.prompt_build", { name }),
});

const previewElement = useTemplateRef<HTMLIFrameElement>("preview");
const canvasElement = useTemplateRef<HTMLElement>("canvas");
const requestedPage = ref(props.initialPage);
const width = ref<MockupWidth>(props.initialWidth ?? "desktop");
const mode = ref<MockupMode>(props.initialMode ?? "edit");
const replacing = ref<string>();

const pages = computed(() => state.value?.pages ?? []);
const issues = computed(() => state.value?.issues ?? []);
const currentPage = computed(
  () =>
    pages.value.find((entry) => entry.id === requestedPage.value) ??
    pages.value[0],
);
const spec = editor.spec;
const pageIndex = computed(() =>
  Math.max(
    0,
    spec.value ? pageIndexOf(spec.value, currentPage.value?.id ?? "") : 0,
  ),
);
const title = computed(() => state.value?.title || props.name);

const editing = useMockupEditing({
  editor,
  catalog,
  page: currentPage,
  pageIndex,
  openPage: (id) => (requestedPage.value = id),
});
const comments = useMockupComments({ session, page: currentPage, pages });

const isEditing = computed(() => mode.value === "edit" && !!spec.value);
const rows = computed(() =>
  spec.value
    ? outlineRows(spec.value, pageIndex.value, catalog.byType.value)
    : [],
);
const navigation = computed(
  (): PreviewNavigation => ({
    title: title.value,
    items: pages.value.map((entry, index) => ({
      id: entry.id,
      label: entry.title,
      icon: index === 0 ? HOME_ICON : undefined,
    })),
    active: currentPage.value?.id,
  }),
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
      padding: page.options.padding ?? true,
      navigation: navigation.value,
    }),
  );
  bridge.post(previewInspectMessage(true));
}

function onSelect(layoutPath: string): void {
  if (mode.value === "comment") {
    comments.open(layoutPath);
    return;
  }
  editing.selectPath(layoutPath);
  canvasElement.value?.focus({ preventScroll: true });
}

const bridge = usePreviewFrame({
  frame: previewElement,
  onReady: syncPreview,
  onSelect,
  onLayout: (blocks) => (editing.rects.value = blocks),
  onText: (message) => {
    if (mode.value === "edit") editing.openText(message);
  },
  onNavigate: (id) => (requestedPage.value = id),
});

watch([state, () => currentPage.value?.id], syncPreview);
watch(mode, () => {
  comments.close();
  editing.text.value = undefined;
});

function blockOf(pointer: string, source: "connect-data" | "custom-zone") {
  const node = spec.value ? nodeAt(spec.value, pointer) : undefined;
  const page = currentPage.value;
  if (!node || !page || !spec.value) return undefined;
  const label = nodeLabel(node, catalog.byType.value);
  const values = {
    mockup: props.name,
    page: page.title,
    block: blockName(node, catalog.byType.value),
    label,
  };
  return {
    source,
    prompt: t(PROMPT_KEYS[source], values),
    block: {
      mockup: props.name,
      page: page.id,
      path: layoutPathOf(spec.value, pointer) ?? "",
      type: node.type,
    },
  };
}

function handOff(
  pointer: string,
  source: "connect-data" | "custom-zone",
): void {
  const request = blockOf(pointer, source);
  if (request) handoff.request(request);
}

function closeReplacement(open: boolean): void {
  if (!open) replacing.value = undefined;
}

function pickReplacement(type: string): void {
  const pointer = replacing.value;
  replacing.value = undefined;
  if (pointer) editing.replaceWith(pointer, type);
}

/** Whether a key pressed on `target` belongs to it: a field, or a dialog over the editor. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      EDITABLE_TAGS.has(target.tagName) ||
      target.closest("[role=dialog]") !== null)
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (isEditable(event.target) || !spec.value) return;
  const key = event.key.toLowerCase();
  const isCommand = event.metaKey || event.ctrlKey;
  if (isCommand && (key === "z" || key === "y")) {
    event.preventDefault();
    if (key === "y" || event.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if (mode.value !== "edit" || !editing.selection.value) return;
  if (key === "delete" || key === "backspace") {
    event.preventDefault();
    editing.remove();
  } else if (key === "escape") {
    editing.selection.value = undefined;
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

const canvasWidth = ref(0);
useResizeObserver(canvasElement, ([entry]) => {
  canvasWidth.value = entry?.contentRect.width ?? 0;
});
const frameWidth = computed(() => MOCKUP_WIDTHS[width.value]);
const frameHeight = computed(() =>
  Math.max(bridge.height.value ?? 0, FRAME_MIN_HEIGHT_PX),
);
/** Draws the frame at its true width, shrunk to fit the canvas: the page lays out as on that screen. */
const scale = computed(() =>
  canvasWidth.value > 0 ? Math.min(1, canvasWidth.value / frameWidth.value) : 1,
);
const previewStyle = computed(() => ({
  width: `${frameWidth.value}px`,
  height: `${frameHeight.value}px`,
}));
const boxStyle = computed(() => ({
  width: `${frameWidth.value * scale.value}px`,
  height: `${frameHeight.value * scale.value}px`,
}));
const stageStyle = computed(() => ({
  ...previewStyle.value,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
}));
</script>

<template>
  <div class="bg-default flex h-dvh flex-col" data-dms-mockup-viewer>
    <MockupTopBar
      v-model:width="width"
      v-model:mode="mode"
      :title="title"
      :can-undo="editor.canUndo.value"
      :can-redo="editor.canRedo.value"
      :issue-count="issues.length"
      :is-connected="isConnected"
      @undo="editor.undo"
      @redo="editor.redo"
      @build="handoff.request({ source: 'build' })"
    />
    <UAlert
      v-if="comments.notice.value"
      color="warning"
      variant="subtle"
      icon="i-ph-warning"
      :title="t(`dms.mockup.${comments.notice.value}`)"
    />
    <UAlert
      v-if="hasRequestFailed"
      color="error"
      variant="subtle"
      icon="i-ph-warning-circle"
      :title="t('dms.mockup.request_failed')"
    />
    <div
      class="grid min-h-0 flex-1"
      :class="
        isEditing
          ? 'grid-cols-[16rem_minmax(0,1fr)_20rem]'
          : 'grid-cols-[minmax(0,1fr)_20rem]'
      "
    >
      <MockupEditPanel
        v-if="isEditing && spec"
        :blocks="catalog.blocks.value"
        :has-catalog-failed="catalog.hasFailed.value"
        :rows="rows"
        :selection="editing.selection.value"
        :pages="spec.pages"
        :current-page="currentPage?.id"
        @add="editing.addBlock"
        @drag-start="(type) => (editing.drag.value = { kind: 'add', type })"
        @drag-end="editing.drag.value = undefined"
        @select="(pointer) => (editing.selection.value = pointer)"
        @open="(id) => (requestedPage = id)"
        @edit="editing.edit"
      />
      <main
        ref="canvas"
        tabindex="-1"
        class="bg-muted min-h-0 overflow-auto p-6 outline-none"
        data-dms-mockup-canvas
      >
        <p v-if="!pages.length" class="text-muted text-sm">
          {{ t("dms.mockup.waiting") }}
        </p>
        <div v-show="pages.length" class="mx-auto" :style="boxStyle">
          <div class="relative" :style="stageStyle">
            <iframe
              ref="preview"
              class="bg-default ring-default block rounded-md ring-1"
              :src="PREVIEW_PATH"
              :title="t('dms.mockup.frame_title')"
              :style="previewStyle"
            />
            <MockupEditOverlay
              v-if="isEditing"
              :selected="editing.selected.value"
              :can-move-up="editing.canMoveUp.value"
              :can-move-down="editing.canMoveDown.value"
              :is-dragging="!!editing.drag.value"
              :drop-line="editing.drop.value?.line"
              :text="editing.text.value"
              :scale="scale"
              @move-up="editing.moveBy(-1)"
              @move-down="editing.moveBy(1)"
              @duplicate="editing.duplicate"
              @remove="editing.remove"
              @drag-start="
                editing.drag.value = editing.selection.value
                  ? {
                      kind: 'move',
                      pointer: editing.selection.value,
                      type: editing.selected.value?.label ?? '',
                    }
                  : undefined
              "
              @drag-end="editing.drag.value = undefined"
              @drag-over="editing.dragOver"
              @drag-leave="editing.drop.value = undefined"
              @drop="editing.dropAt"
              @text-commit="editing.commitText"
              @text-cancel="editing.text.value = undefined"
            />
          </div>
        </div>
      </main>
      <MockupInspector
        v-if="isEditing && spec"
        :spec="spec"
        :page="pageIndex"
        :selection="editing.selection.value"
        :catalog="catalog.byType.value"
        :issues="issues"
        @edit="editing.edit"
        @connect-data="(pointer) => handOff(pointer, 'connect-data')"
        @ask-ai="(pointer) => handOff(pointer, 'custom-zone')"
        @replace="(pointer) => (replacing = pointer)"
      />
      <MockupCommentPanel
        v-else
        v-model:note="comments.note.value"
        :pending="comments.pending.value?.path"
        :annotations="annotations"
        :issues="issues"
        @save="comments.save"
        @cancel="comments.pending.value = undefined"
        @status="session.setAnnotationStatus"
      />
    </div>
    <MockupPromptModal v-model:prompt="handoff.fallback.value" />
    <UModal
      :open="replacing !== undefined"
      :title="t('dms.mockup.replace_title')"
      @update:open="closeReplacement"
    >
      <template #body>
        <MockupBlockCatalog
          :blocks="catalog.blocks.value"
          @pick="pickReplacement"
        />
      </template>
    </UModal>
  </div>
</template>
