import { useTemplateRef, watch, type Ref } from "vue";
import {
  previewInspectMessage,
  previewMinHeightMessage,
  type PreviewNavigation,
} from "../../utils/blockPreviewMessages";
import type {
  MockupPageState,
  MockupState,
  MockupWidth,
} from "../../utils/mockup";
import { mockupPageRender } from "../../utils/mockupFrame";
import { followedRecord, mockupPageParams } from "../../utils/mockupLinks";
import type { PagePoint } from "../../utils/mockupPins";
import type { MockupSectionEdit } from "../../utils/mockupSections";
import type { MockupEditing } from "./useMockupEditing";
import { useMockupFrameSize } from "./useMockupFrameSize";
import type { ClientPoint } from "./useMockupPins";
import { useMockupSketchStates } from "./useMockupSketchStates";
import { usePreviewFrame } from "./usePreviewFrame";

interface PageFrameOptions {
  editing: MockupEditing;
  width: Readonly<Ref<MockupWidth>>;
  /** The state the canvas draws. */
  shown: Readonly<Ref<MockupState | undefined>>;
  pages: Readonly<Ref<readonly MockupPageState[]>>;
  currentPage: Readonly<Ref<MockupPageState | undefined>>;
  /** The row the page shows. */
  record: Readonly<Ref<string | undefined>>;
  realData: Readonly<Ref<boolean>>;
  navigation: Readonly<Ref<PreviewNavigation>>;
  isPreviewing: Readonly<Ref<boolean>>;
  /** Opens the page `id`, on the row `record` when a link names one. */
  openPage: (id: string, record?: string) => void;
  onSectionEdit: (edit: MockupSectionEdit) => void;
  /** Escape was pressed in the preview, and nothing of its page took it. */
  onEscape: () => void;
}

/**
 * The page view's frame: the preview iframe of the template's `preview`
 * element, drawn at the size the canvas gives it, which the page is posted to
 * whenever what it draws changes, and what the frame reports back, a block
 * picked, a link followed, the sections of its sidebar edited. The sketch
 * states picked in the inspector are drawn through it too, so a pick redraws.
 */
export function useMockupPageFrame(options: PageFrameOptions) {
  const { editing } = options;
  const previewElement = useTemplateRef<HTMLIFrameElement>("preview");
  const canvasElement = useTemplateRef<HTMLElement>("canvas");
  const stageElement = useTemplateRef<HTMLElement>("stage");
  const sketchStates = useMockupSketchStates(sync);

  function sync(): void {
    const page = options.currentPage.value;
    if (!page) return;
    bridge.post(
      mockupPageRender(
        page,
        sketchStates.treeOf(page, options.realData.value),
        options.navigation.value,
        mockupPageParams(page, options.record.value),
      ),
    );
    bridge.post(previewInspectMessage(!options.isPreviewing.value));
    bridge.post(previewMinHeightMessage(size.fillHeight.value));
  }

  function focusCanvas(): void {
    canvasElement.value?.focus({ preventScroll: true });
  }

  function deselect(): void {
    editing.selection.value = undefined;
    focusCanvas();
  }

  const bridge = usePreviewFrame({
    frame: previewElement,
    onReady: sync,
    onSelect: (layoutPath) => {
      editing.selectPath(layoutPath);
      focusCanvas();
    },
    onSelectPage: deselect,
    onLayout: (blocks) => editing.setLayout(blocks),
    onText: (message) => editing.openText(message),
    onNavigate: (id, linked) =>
      options.openPage(
        id,
        linked ??
          followedRecord(
            options.pages.value.find((page) => page.id === id),
            options.currentPage.value,
            options.record.value,
          ),
      ),
    onEscape: options.onEscape,
    onSectionEdit: options.onSectionEdit,
  });
  const size = useMockupFrameSize({
    canvas: canvasElement,
    width: options.width,
    reportedHeight: bridge.height,
  });

  watch(
    [
      options.shown,
      () => options.currentPage.value?.id,
      options.realData,
      options.navigation,
      options.record,
    ],
    sync,
  );
  watch(size.fillHeight, (height) =>
    bridge.post(previewMinHeightMessage(height)),
  );

  return {
    bridge,
    sketchStates,
    focusCanvas,
    /** Deselects the block on a click on the canvas itself, around the page, and leaves a click on anything drawn in it to that. */
    onCanvasClick(event: MouseEvent): void {
      if (event.target === event.currentTarget) deselect();
    },
    ...size,
    /** The page in view, and the point of its frame's document, under a point of the screen. */
    toFrame(client: ClientPoint): PagePoint | undefined {
      const stage = stageElement.value?.getBoundingClientRect();
      const page = options.currentPage.value?.id;
      if (!stage || page === undefined) return undefined;
      return {
        page,
        point: {
          x: (client.x - stage.left) / size.scale.value,
          y: (client.y - stage.top) / size.scale.value,
        },
      };
    },
  };
}
