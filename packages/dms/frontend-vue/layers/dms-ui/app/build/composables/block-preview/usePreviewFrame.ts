import {
  onBeforeUnmount,
  onMounted,
  ref,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  parsePreviewOutboundMessage,
  type PreviewBlockRect,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
  type PreviewTextMessage,
} from "../../utils/blockPreviewMessages";

interface PreviewFrameOptions {
  frame: Readonly<ShallowRef<HTMLIFrameElement | null>>;
  /** The preview mounted and can be handed a tree: also after it reloaded. */
  onReady: () => void;
  /** A block of the preview was picked, by its layout path. */
  onSelect: (path: string) => void;
  /** Where each block now sits, while inspecting. */
  onLayout?: (blocks: PreviewBlockRect[]) => void;
  /** A text of a block was double-clicked, while inspecting. */
  onText?: (text: PreviewTextMessage) => void;
  /** An entry of the preview's sidebar was picked, by its id. */
  onNavigate?: (id: string) => void;
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
    layout: (message) => {
      if (message.type === "layout") options.onLayout?.(message.blocks);
    },
    text: (message) => {
      if (message.type === "text") options.onText?.(message);
    },
    navigate: (message) => {
      if (message.type === "navigate") options.onNavigate?.(message.id);
    },
  };

  function onMessage(event: MessageEvent): void {
    const target = options.frame.value?.contentWindow;
    if (!target || event.source !== target) return;
    const message = parsePreviewOutboundMessage(event.data);
    if (message) handlers[message.type](message);
  }

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
