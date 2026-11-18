import {
  onBeforeUnmount,
  onMounted,
  ref,
  type Ref,
  type ShallowRef,
  watch,
} from "vue";
import type { JsonValue } from "../../../../../dms-core/app/types/json";
import {
  parsePreviewOutboundMessage,
  type PreviewBlockRect,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
  type PreviewTextMessage,
} from "../../utils/blockPreviewMessages";
import type { MockupSectionEdit } from "../../utils/mockupSections";

interface PreviewFrameOptions {
  frame: Readonly<ShallowRef<HTMLIFrameElement | null>>;
  /** The preview mounted and can be handed a tree: also after it reloaded. */
  onReady: () => void;
  /** A block of the preview was picked, by its layout path. */
  onSelect: (path: string) => void;
  /** The preview's page header was picked: the page itself. */
  onSelectPage?: () => void;
  /** Where each block now sits, while inspecting. */
  onLayout?: (blocks: PreviewBlockRect[]) => void;
  /** A text of a block was double-clicked, while inspecting. */
  onText?: (text: PreviewTextMessage) => void;
  /** An entry of the preview's sidebar, or a link to a page of the mockup, was picked: the page's id, and the row a link from a row passes. */
  onNavigate?: (id: string, record?: string) => void;
  /** Escape was pressed in the preview, and nothing of its page took it. */
  onEscape?: () => void;
  /** The preview's sidebar changed its sections. */
  onSectionEdit?: (edit: MockupSectionEdit) => void;
}

/** The embedding side of `/dms-preview`'s `postMessage` protocol. */
export interface PreviewFrame {
  /** Content height the preview last reported, in CSS pixels. */
  height: Ref<number | undefined>;
  isReady: Ref<boolean>;
  /** Hands the preview a message; dropped until the preview is ready. */
  post: (message: PreviewInboundMessage) => void;
}

/**
 * Talks to the preview iframe: posts it messages once it said `ready`, and
 * follows what it reports back. Only the frame's own window is listened to.
 * A new frame element is a new document, so nothing is posted to it before
 * it says `ready` in turn. A press in the preview is replayed as a
 * `pointerdown` on the frame element, so the page's own listeners see it as
 * a press on the frame.
 */
export function usePreviewFrame(options: PreviewFrameOptions): PreviewFrame {
  const height = ref<number>();
  const isReady = ref(false);

  const handlers: Record<
    PreviewOutboundMessage["type"],
    (message: PreviewOutboundMessage) => void
  > = {
    ready: () => {
      isReady.value = true;
      options.onReady();
    },
    resize: (message) => {
      if (message.type === "resize") height.value = message.height;
    },
    error: () => {},
    select: (message) => {
      if (message.type === "select") options.onSelect(message.path);
    },
    "select-page": () => options.onSelectPage?.(),
    layout: (message) => {
      if (message.type === "layout") options.onLayout?.(message.blocks);
    },
    text: (message) => {
      if (message.type === "text") options.onText?.(message);
    },
    navigate: (message) => {
      if (message.type === "navigate") {
        options.onNavigate?.(message.id, message.record);
      }
    },
    escape: () => options.onEscape?.(),
    "section-edit": (message) => {
      if (message.type === "section-edit")
        options.onSectionEdit?.(message.edit);
    },
    press: (message) => {
      if (message.type !== "press") return;
      options.frame.value?.dispatchEvent(
        new PointerEvent("pointerdown", { button: message.button }),
      );
    },
  };

  function onMessage(event: MessageEvent<JsonValue>): void {
    const target = options.frame.value?.contentWindow;
    if (!target || event.source !== target) return;
    const message = parsePreviewOutboundMessage(event.data);
    if (message) handlers[message.type](message);
  }

  watch(options.frame, () => {
    isReady.value = false;
  });
  onMounted(() => window.addEventListener("message", onMessage));
  onBeforeUnmount(() => window.removeEventListener("message", onMessage));

  return {
    height,
    isReady,
    post: (message) => {
      if (!isReady.value) return;
      options.frame.value?.contentWindow?.postMessage(
        message,
        window.location.origin,
      );
    },
  };
}
