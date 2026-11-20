<script setup lang="ts">
import { computed, ref } from "vue";
import { useMockupCatalog } from "../../composables/block-preview/useMockupCatalog";
import { useMockupDocument } from "../../composables/block-preview/useMockupDocument";
import { useMockupEditing } from "../../composables/block-preview/useMockupEditing";
import { useMockupGridLayout } from "../../composables/block-preview/useMockupGridLayout";
import { useMockupLocks } from "../../composables/block-preview/useMockupLocks";
import { useMockupOverview } from "../../composables/block-preview/useMockupOverview";
import { useMockupPageFrame } from "../../composables/block-preview/useMockupPageFrame";
import { useMockupPanels } from "../../composables/block-preview/useMockupPanels";
import { useMockupPins } from "../../composables/block-preview/useMockupPins";
import { useMockupRealData } from "../../composables/block-preview/useMockupRealData";
import { useMockupSectionWrites } from "../../composables/block-preview/useMockupSectionWrites";
import { useMockupSession } from "../../composables/block-preview/useMockupSession";
import { useMockupToolModes } from "../../composables/block-preview/useMockupToolModes";
import { useMockupViewerHandoff } from "../../composables/block-preview/useMockupViewerHandoff";
import { useMockupViewerPages } from "../../composables/block-preview/useMockupViewerPages";
import { useMockupViewerShortcuts } from "../../composables/block-preview/useMockupViewerShortcuts";
import type { MockupDataMode, MockupWidth } from "../../utils/mockup";
import { mockupNavigation } from "../../utils/mockupFrame";
import { outlineRows } from "../../utils/mockupOutline";
import { specCategories } from "../../utils/mockupSections";
import MockupEditOverlay from "./MockupEditOverlay.vue";
import MockupEditPanel from "./MockupEditPanel.vue";
import MockupHistoryPanel from "./MockupHistoryPanel.vue";
import MockupInspector from "./MockupInspector.vue";
import MockupModules from "./MockupModules.vue";
import MockupOverview from "./MockupOverview.vue";
import MockupPinLayer from "./MockupPinLayer.vue";
import MockupPlacementChip from "./MockupPlacementChip.vue";
import MockupPromptModal from "./MockupPromptModal.vue";
import MockupReplaceModal from "./MockupReplaceModal.vue";
import MockupSectionDeleteModal from "./MockupSectionDeleteModal.vue";
import MockupShortcutsModal from "./MockupShortcutsModal.vue";
import MockupCanvasChrome from "./MockupCanvasChrome.vue";
import MockupStatusBanners from "./MockupStatusBanners.vue";
import MockupTopBar from "./MockupTopBar.vue";

/**
 * One mockup, live. A click selects a block to edit the spec in place:
 * add, move, duplicate, remove and restyle blocks, edit pages, each edit
 * written to `spec.json` at once, with undo and redo. The Comment tool drops
 * a pin with a note for the AI on a block or on the page; pins are dragged
 * to another spot at any time, and "Resolve with AI" hands the open ones to
 * the assistant. The page is drawn by the real block preview in an iframe,
 * inside the sidebar of the mockup's pages; data wiring is never edited here,
 * but handed to the AI. A page converted from a live page reads its live
 * routes while Real data is on, which it is unless the developer turns it
 * off; any other page reads its fixtures alone. Only the open comments show
 * on the current spec. The History panel lists the versions of the spec, with
 * how many comments were pinned on each; one picked is drawn read-only in
 * place of the current spec, with the comments pinned on it, resolved or not,
 * until the viewer goes back to it or restores it. The Overview is the
 * mockup's home: it lays every page of what is on screen side by side, to
 * look at and comment on, never to edit, and shows while no page is open. A
 * page opened from it shows a ✕, which, as Escape once nothing else takes it,
 * goes back to the Overview where it was. Preview hands every click to the
 * page, as the dashboard runs it; Escape leaves it. Each page opened, from
 * the Overview or a link, is a new entry of the browser's history.
 */
const props = defineProps<{
  name: string;
  initialWidth?: MockupWidth;
  initialData?: MockupDataMode;
}>();

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const config = useDmsRuntimeConfig();

const session = useMockupSession({
  name: props.name,
  baseURL: config.public.dms?.baseURL?.replace(/\/+$/, "") ?? "",
  authFetch: $authFetch,
});
const { state, isConnected, hasRequestFailed } = session;
const heldBlock = ref<string>();
const { editor, history } = useMockupDocument({
  name: props.name,
  state,
  viewer: session.viewer,
  held: heldBlock,
  onNotice: () => editing.settle(),
});
const catalog = useMockupCatalog($authFetch);
const panels = useMockupPanels();

const width = ref<MockupWidth>(props.initialWidth ?? "desktop");
const replacing = ref<string>();
const showsShortcuts = ref(false);

const spec = editor.spec;
const {
  shown,
  isReadOnly,
  title,
  pages,
  categories,
  modules,
  issues,
  requestedPage,
  record,
  open: openPage,
  currentPage,
  isOverview,
  pageIndex,
  isVirtual,
  close: closePage,
} = useMockupViewerPages({ name: props.name, state, history, spec });
const { choice, hasRealData, realData, previewSrc } = useMockupRealData(
  currentPage,
  pages,
  isOverview,
  props.initialData,
);
const { handoff, runs, handOff, build, resolveComments } =
  useMockupViewerHandoff({
    name: props.name,
    title: () => title.value,
    spec,
    currentPage,
    pages,
    catalog,
    isOverview,
  });

const selection = ref<string>();
const locks = useMockupLocks({
  name: props.name,
  authFetch: $authFetch,
  viewer: session.viewer,
  presence: session.presence,
  isConnected,
  ownEdit: editor.ownEdit,
  selection,
  isPending: editor.isPending,
  spec: editor.spec,
  digest: editor.digest,
  held: heldBlock,
});
const editing = useMockupEditing({
  editor,
  catalog,
  page: currentPage,
  pageIndex,
  openPage: (id) => (requestedPage.value = id),
  revision: computed(() => state.value?.revision),
  selection,
  isHeld: locks.isHeld,
});
const overview = useMockupOverview({
  name: props.name,
  isOpen: isOverview,
  pages,
  categories,
});
const pins = useMockupPins({
  session,
  canvases: computed(() => {
    if (isOverview.value) return overview.canvases.value;
    const page = currentPage.value;
    if (!page) return [];
    return [
      {
        page,
        blocks: editing.rects.value,
        width: frameWidth.value,
        height: frameHeight.value,
        states: sketchStates.of(page.id),
      },
    ];
  }),
  toFrame: (client) =>
    isOverview.value ? overview.toFrame(client) : toFrame(client),
  previewed: computed(() => history.previewing.value?.annotations),
});
const { isPreviewing, mode } = useMockupToolModes({
  editing,
  pins,
  isOverview,
  post: (message) => bridge.post(message),
  focusCanvas: () => focusCanvas(),
});

const rows = computed(() =>
  spec.value
    ? outlineRows(
        spec.value,
        pageIndex.value,
        catalog.byType.value,
        locks.holders.value,
      )
    : [],
);
/** The editing panels show on the current spec's page view alone: the Overview, Preview, a past version and a generated form page edit nothing. */
const canEdit = computed(
  () =>
    !!spec.value &&
    !isReadOnly.value &&
    !isOverview.value &&
    !isPreviewing.value &&
    !isVirtual.value,
);
const navigation = computed(() =>
  mockupNavigation({
    title: title.value,
    categories: categories.value,
    pages: pages.value,
    active: currentPage.value?.id,
    editable: canEdit.value,
    widgets: shown.value?.sidebar?.widgets,
  }),
);
const sections = useMockupSectionWrites({
  spec,
  canEdit,
  edit: editing.edit,
});
const shortcuts = useMockupViewerShortcuts({
  editor,
  editing,
  pins,
  panels,
  history,
  overview,
  isOverview,
  isReadOnly,
  isPreviewing,
  showsShortcuts,
  closePage,
});

const {
  bridge,
  sketchStates,
  focusCanvas,
  frameWidth,
  frameHeight,
  scale,
  previewStyle,
  boxStyle,
  stageStyle,
  toFrame,
  onCanvasClick,
} = useMockupPageFrame({
  editing,
  width,
  shown,
  pages,
  currentPage,
  record,
  realData,
  navigation,
  isPreviewing,
  openPage,
  onSectionEdit: (edit) => sections.write(edit),
  onEscape: () =>
    shortcuts.run(new KeyboardEvent("keydown", { key: "Escape" })),
});

const { showsLeft, showsInspector, gridClass } = useMockupGridLayout({
  panels,
  canEdit,
  isHistoryOpen: history.isOpen,
});
</script>

<template>
  <div class="bg-default flex h-dvh flex-col" data-dms-mockup-viewer>
    <MockupTopBar
      v-model:width="width"
      v-model:real-data="realData"
      v-model:placing="pins.isPlacing.value"
      v-model:previewing="isPreviewing"
      :has-real-data="hasRealData"
      :title="title"
      :can-undo="editor.canUndo.value && canEdit"
      :can-redo="editor.canRedo.value && canEdit"
      :is-overview="isOverview"
      :issue-count="issues.length"
      :is-connected="isConnected"
      :panels="panels.open.value"
      :is-history-open="history.isOpen.value"
      :is-building="runs.isRunning('build')"
      @history="history.toggle"
      @undo="shortcuts.undo"
      @redo="shortcuts.redo"
      @build="build"
      @panel="panels.toggle"
      @rename="(next) => editing.edit({ kind: 'setTitle', title: next })"
      @shortcuts="showsShortcuts = true"
    />
    <MockupStatusBanners
      :has-save-failed="editor.hasFailed.value"
      :has-request-failed="hasRequestFailed"
      :history="history"
    />
    <MockupModules :modules="modules" />
    <div class="grid min-h-0 flex-1" :class="gridClass">
      <MockupEditPanel
        v-if="showsLeft && spec"
        :blocks="catalog.blocks.value"
        :has-catalog-failed="catalog.hasFailed.value"
        :rows="rows"
        :selection="editing.selection.value"
        :pages="spec.pages"
        :categories="specCategories(spec)"
        :current-page="currentPage?.id"
        @arm="editing.armPlacing"
        @drag-start="(type) => (editing.drag.value = { kind: 'add', type })"
        @drag-end="editing.drag.value = undefined"
        @select="(pointer) => (editing.selection.value = pointer)"
        @open="(id) => (requestedPage = id)"
        @edit="editing.edit"
        @section="sections.write"
      />
      <div class="relative min-h-0 min-w-0">
        <main
          v-show="!isOverview"
          ref="canvas"
          tabindex="-1"
          class="bg-muted absolute inset-0 overflow-auto p-6 pe-20 outline-none"
          data-dms-mockup-canvas
          @click="onCanvasClick"
        >
          <div
            v-if="!pages.length"
            class="flex h-full flex-col items-center justify-center gap-2"
            data-dms-mockup-empty
          >
            <UIcon
              name="i-ph-sparkle"
              class="text-primary size-6 animate-pulse motion-reduce:animate-none"
            />
            <p class="text-muted text-sm">
              {{ state ? t("dms.mockup.writing") : t("dms.mockup.waiting") }}
            </p>
          </div>
          <div v-show="pages.length" class="mx-auto" :style="boxStyle">
            <div ref="stage" class="relative" :style="stageStyle">
              <iframe
                ref="preview"
                :key="previewSrc"
                class="bg-default ring-default block rounded-md ring-1"
                :src="previewSrc"
                :title="t('dms.mockup.frame_title')"
                :style="previewStyle"
              />
              <MockupEditOverlay
                v-if="spec && !isReadOnly && !isPreviewing && !isVirtual"
                :selected="
                  locks.blocker.value ? undefined : editing.selected.value
                "
                :can-move-up="editing.canMoveUp.value"
                :can-move-down="editing.canMoveDown.value"
                :is-dragging="!!editing.drag.value"
                :is-placing="!!editing.placing.value"
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
                @place-hover="editing.hoverPlacing"
                @place="editing.placeAt"
                @text-commit="editing.commitText"
                @text-cancel="editing.text.value = undefined"
              />
              <MockupPinLayer
                v-if="currentPage && !isVirtual && !isOverview && !isPreviewing"
                :pins="pins"
                :page="currentPage.id"
                :scale="scale"
              />
            </div>
          </div>
        </main>
        <MockupOverview
          v-if="isOverview"
          class="absolute inset-0"
          :overview="overview"
          :pins="pins"
          :pages="pages"
          :categories="categories"
          :navigation-title="title"
          :data-mode="choice"
          @open="openPage"
        />
        <div
          v-if="state && !isConnected"
          class="bg-muted/80 absolute inset-0 z-40 flex items-center justify-center gap-2 backdrop-blur-sm"
          role="status"
          data-dms-mockup-reconnecting
        >
          <UIcon
            name="i-ph-arrows-clockwise"
            class="text-muted size-5 animate-spin motion-reduce:animate-none"
          />
          <p class="text-muted text-sm">{{ t("dms.mockup.disconnected") }}</p>
        </div>
        <MockupCanvasChrome
          :has-open-page="!isOverview && pages.length > 0"
          :is-locked="isReadOnly || isPreviewing"
          :pins="pins"
          :mode="mode"
          :is-unclaimed="handoff.isUnclaimed.value"
          :is-resolving="runs.isRunning('resolve-comments')"
          @close="closePage"
          @resolve="resolveComments"
        />
      </div>
      <MockupHistoryPanel
        v-if="history.isOpen.value"
        :versions="history.versions.value"
        :previewing="history.previewing.value?.seq"
        :is-loading="history.isLoading.value"
        :has-failed="history.hasFailed.value"
        @preview="history.preview"
        @current="history.backToCurrent"
        @close="history.close"
      />
      <MockupInspector
        v-else-if="showsInspector && spec"
        :spec="spec"
        :page="pageIndex"
        :selection="editing.selection.value"
        :catalog="catalog.byType.value"
        :issues="issues"
        :locked-by="locks.blocker.value?.name"
        :sketch-state="
          sketchStates.of(currentPage?.id).get(editing.selection.value ?? '')
        "
        @edit="editing.edit"
        @ask-ai="handOff"
        @replace="(pointer) => (replacing = pointer)"
        @sketch-state="
          (pointer, state) =>
            currentPage && sketchStates.pick(currentPage.id, pointer, state)
        "
      />
    </div>
    <MockupPlacementChip
      v-if="editing.placing.value"
      :name="editing.placing.value.name"
    />
    <MockupPromptModal v-model:prompt="handoff.fallback.value" />
    <MockupShortcutsModal v-model:open="showsShortcuts" />
    <MockupSectionDeleteModal
      :removing="sections.removing.value"
      @cancel="sections.cancel"
      @confirm="sections.confirm"
    />
    <MockupReplaceModal
      v-model:pointer="replacing"
      :blocks="catalog.blocks.value"
      @pick="editing.replaceWith"
    />
  </div>
</template>
