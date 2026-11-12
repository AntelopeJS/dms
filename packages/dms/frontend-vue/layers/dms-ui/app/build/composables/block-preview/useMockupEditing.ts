import {
  computed,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import { isString } from "../../../../../dms-core/app/utils/type-check";
import type {
  PreviewBlockRect,
  PreviewFont,
  PreviewRect,
  PreviewTextMessage,
} from "../../utils/blockPreviewMessages";
import {
  layoutPathFor,
  specPointerFor,
  type MockupPageState,
} from "../../utils/mockup";
import { newBlockNode } from "../../utils/mockupCatalog";
import {
  dropEdit,
  dropTarget,
  insertionAfter,
  type MockupDrag,
  type MockupDropTarget,
} from "../../utils/mockupDrop";
import type { MockupEdit } from "../../utils/mockupEdit";
import {
  nodeAt,
  parentPointer,
  parseNodePointer,
  siblingsAt,
} from "../../utils/mockupSpec";
import type { MockupCatalog } from "./useMockupCatalog";
import type { MockupSpecEditor } from "./useMockupSpec";

/** A text of a block being edited in place, and the option it is. */
export interface MockupInlineText {
  pointer: string;
  key: string;
  value: string;
  rect: PreviewRect;
  font: PreviewFont;
}

interface EditingOptions {
  editor: MockupSpecEditor;
  catalog: MockupCatalog;
  /** The open page as compiled: its layout paths. */
  page: ComputedRef<MockupPageState | undefined>;
  /** The open page's index in the spec. */
  pageIndex: ComputedRef<number>;
  /** Opens another page, after a page edit. */
  openPage: (id: string) => void;
  /** The revision of the compiled state the preview draws. */
  revision: ComputedRef<number | undefined>;
}

/** Edit mode's state: what is selected, dragged and edited in place, and the actions on it. */
export interface MockupEditing {
  selection: Ref<string | undefined>;
  rects: ShallowRef<PreviewBlockRect[]>;
  drag: Ref<MockupDrag | undefined>;
  drop: Ref<MockupDropTarget | undefined>;
  text: Ref<MockupInlineText | undefined>;
  /** Where the selected block is drawn; undefined until the preview draws the edited spec. */
  selected: ComputedRef<{ rect: PreviewRect; label: string } | undefined>;
  canMoveUp: ComputedRef<boolean>;
  canMoveDown: ComputedRef<boolean>;
  edit: (edit: MockupEdit, coalesceKey?: string) => void;
  /** Takes the boxes the preview reports for the state it draws now. */
  setLayout: (blocks: PreviewBlockRect[]) => void;
  /** Marks the drawn boxes stale until the next state: after an undo or a redo. */
  markMoved: () => void;
  /** Trusts the drawn boxes again: a write that changes nothing on screen. */
  settle: () => void;
  selectPath: (layoutPath: string) => void;
  moveBy: (delta: number) => void;
  duplicate: () => void;
  remove: () => void;
  addBlock: (type: string) => void;
  replaceWith: (pointer: string, type: string) => void;
  dragOver: (point: { x: number; y: number }) => void;
  dropAt: (point: { x: number; y: number }) => void;
  openText: (message: PreviewTextMessage) => void;
  commitText: (value: string) => void;
}

/** Wires edit mode: every action becomes one reducer edit, whose result picks the selection. */
export function useMockupEditing(options: EditingOptions): MockupEditing {
  const { editor, catalog } = options;
  const selection = ref<string>();
  const rects = shallowRef<PreviewBlockRect[]>([]);
  const drag = ref<MockupDrag>();
  const drop = ref<MockupDropTarget>();
  const text = ref<MockupInlineText>();
  /** The revision drawn when nodes last moved, until a newer one is laid out. */
  const movedAt = ref<number>();

  const spec = editor.spec;
  const selectedNode = computed(() =>
    spec.value && selection.value
      ? nodeAt(spec.value, selection.value)
      : undefined,
  );
  const position = computed(() => {
    const address = selection.value && parseNodePointer(selection.value);
    const page = address && spec.value?.pages[address.page];
    if (!address || !page) return undefined;
    const siblings = siblingsAt(page, address.steps) ?? [];
    return { index: address.steps.at(-1) ?? 0, count: siblings.length };
  });

  watch([spec, () => options.pageIndex.value], () => {
    if (!selectedNode.value) selection.value = undefined;
    const address = selection.value && parseNodePointer(selection.value);
    if (address && address.page !== options.pageIndex.value) {
      selection.value = undefined;
    }
  });

  function markMoved(): void {
    movedAt.value = options.revision.value ?? -1;
  }

  function setLayout(blocks: PreviewBlockRect[]): void {
    rects.value = blocks;
    const drawn = options.revision.value ?? -1;
    if (movedAt.value !== undefined && drawn > movedAt.value) {
      movedAt.value = undefined;
    }
  }

  function edit(next: MockupEdit, coalesceKey?: string): void {
    const result = editor.apply(next, coalesceKey);
    if (!result) return;
    if (next.kind !== "setOption" && next.kind !== "setText") markMoved();
    if (result.page !== undefined) {
      options.openPage(result.page);
      selection.value = undefined;
      return;
    }
    selection.value = result.select;
  }

  function selectPath(layoutPath: string): void {
    const page = options.page.value;
    selection.value = page ? specPointerFor(page, layoutPath) : undefined;
  }

  function moveBy(delta: number): void {
    const from = selection.value;
    const at = position.value;
    if (!from || !at) return;
    const parent = parentPointer(from);
    if (parent === undefined) return;
    edit({ kind: "moveNode", from, parent, index: at.index + delta });
  }

  function newNode(type: string) {
    const block = catalog.byType.value.get(type);
    return block ? newBlockNode(block, catalog.byType.value) : { type };
  }

  function pageId(): string | undefined {
    return spec.value?.pages[options.pageIndex.value]?.id;
  }

  function addBlock(type: string): void {
    const page = pageId();
    if (!spec.value || !page) return;
    const at = insertionAfter(
      spec.value,
      options.pageIndex.value,
      selection.value,
      type,
      catalog.byType.value,
    );
    edit({ kind: "insertNode", page, ...at, node: newNode(type) });
  }

  function dropContext() {
    const current = spec.value;
    const page = options.page.value;
    if (!current || !page) return undefined;
    return {
      spec: current,
      page: options.pageIndex.value,
      blocks: rects.value,
      paths: page.paths,
      catalog: catalog.byType.value,
    };
  }

  function dragOver(point: { x: number; y: number }): void {
    const context = dropContext();
    drop.value =
      context && drag.value
        ? dropTarget(context, drag.value, point)
        : undefined;
  }

  function dropAt(point: { x: number; y: number }): void {
    const current = drag.value;
    const context = dropContext();
    const page = pageId();
    drag.value = undefined;
    drop.value = undefined;
    if (!current || !context || !page) return;
    const target = dropTarget(context, current, point);
    edit(dropEdit(current, target, page, () => newNode(current.type)));
  }

  function openText(message: PreviewTextMessage): void {
    const page = options.page.value;
    const pointer = page ? specPointerFor(page, message.path) : undefined;
    const node =
      spec.value && pointer ? nodeAt(spec.value, pointer) : undefined;
    const wanted = message.text.trim();
    const key = Object.entries(node?.options ?? {}).find(
      ([, value]) => isString(value) && value.trim() === wanted,
    )?.[0];
    if (!pointer) return;
    selection.value = pointer;
    if (key === undefined) return;
    text.value = {
      pointer,
      key,
      value: message.text,
      rect: message.rect,
      font: message.font,
    };
  }

  function commitText(value: string): void {
    const current = text.value;
    text.value = undefined;
    if (!current || value === current.value) return;
    edit({
      kind: "setText",
      pointer: current.pointer,
      key: current.key,
      value,
    });
  }

  const selected = computed(() => {
    if (movedAt.value !== undefined) return undefined;
    const page = options.page.value;
    const path =
      page && selection.value
        ? layoutPathFor(page, selection.value)
        : undefined;
    const rect = rects.value.find((block) => block.path === path)?.rect;
    const node = selectedNode.value;
    if (!rect || !node) return undefined;
    return { rect, label: node.type ?? node.componentName ?? "" };
  });

  return {
    selection,
    rects,
    drag,
    drop,
    text,
    selected,
    canMoveUp: computed(() => (position.value?.index ?? 0) > 0),
    canMoveDown: computed(() => {
      const at = position.value;
      return !!at && at.index < at.count - 1;
    }),
    edit,
    setLayout,
    markMoved,
    settle: () => (movedAt.value = undefined),
    selectPath,
    moveBy,
    duplicate: () => {
      if (selection.value) {
        edit({ kind: "duplicateNode", pointer: selection.value });
      }
    },
    remove: () => {
      if (selection.value)
        edit({ kind: "removeNode", pointer: selection.value });
    },
    addBlock,
    replaceWith: (pointer, type) =>
      edit({ kind: "replaceNode", pointer, node: newNode(type) }),
    dragOver,
    dropAt,
    openText,
    commitText,
  };
}
