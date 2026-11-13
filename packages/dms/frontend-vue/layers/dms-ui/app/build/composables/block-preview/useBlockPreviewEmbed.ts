import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  PREVIEW_THEMES,
  parsePreviewMessage,
  previewErrorMessage,
  previewReadyMessage,
  previewResizeMessage,
  previewSelectMessage,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
  type PreviewState,
  type PreviewTheme,
  type PreviewTree,
} from "../../utils/blockPreview";
import { useBlockInspector } from "./useBlockInspector";

/** What the embedded preview shows: `?state=` first, then each message. */
export interface BlockPreviewEmbed {
  tree: Ref<PreviewTree | undefined>;
  /** Bumped on each `render`, so the blocks remount with fresh state. */
  revision: Ref<number>;
  /** Whether the page leaves its background to the embedding page. */
  transparent: Ref<boolean>;
  /** Whether the blocks are padded off the edges, when `?state=` or a `render` said so. */
  padding: Ref<boolean | undefined>;
  /** Whether a click picks a block for the embedding page instead of reaching it. */
  inspecting: Ref<boolean>;
  /** Tells the embedding page what went wrong. */
  reportError: (message: string) => void;
}

interface EmbedOptions {
  root: Readonly<ShallowRef<HTMLElement | null>>;
  initialState: PreviewState | undefined;
  setLocale: (locale: string) => void;
}

function postToParent(message: PreviewOutboundMessage): void {
  if (window.parent === window) return;

  window.parent.postMessage(message, "*");
}

/**
 * Sets the class the color mode plugin keeps on `<html>`, without writing the
 * visitor's stored preference: the theme belongs to the embedding page.
 */
function applyTheme(theme: PreviewTheme | undefined): void {
  if (!theme || typeof document === "undefined") return;
  const classes = document.documentElement.classList;
  classes.remove(...PREVIEW_THEMES);
  classes.add(theme);
}

function observeHeight(root: HTMLElement): ResizeObserver {
  const observer = new ResizeObserver(() => {
    postToParent(previewResizeMessage(root.getBoundingClientRect().height));
  });
  observer.observe(root);
  return observer;
}

/**
 * The embed side of `/dms-preview`: reads `render` and `theme` messages from
 * the parent window, applies the theme and locale, and reports `ready`, each
 * height change and errors back to it.
 */
export function useBlockPreviewEmbed(options: EmbedOptions): BlockPreviewEmbed {
  const tree = ref<PreviewTree | undefined>(options.initialState?.tree);
  const theme = ref(options.initialState?.theme);
  const locale = ref(options.initialState?.locale);
  const transparent = ref(options.initialState?.transparent ?? false);
  const padding = ref(options.initialState?.padding);
  const revision = ref(0);
  const inspecting = ref(false);
  let observer: ResizeObserver | undefined;

  useBlockInspector({
    enabled: inspecting,
    onSelect: (path) => postToParent(previewSelectMessage(path)),
  });

  const handlers: Record<
    PreviewInboundMessage["type"],
    (message: PreviewInboundMessage) => void
  > = {
    render: (message) => {
      if (message.type !== "render") return;
      tree.value = message.tree;
      theme.value = message.theme ?? theme.value;
      locale.value = message.locale ?? locale.value;
      transparent.value = message.transparent ?? transparent.value;
      padding.value = message.padding ?? padding.value;
      revision.value += 1;
    },
    theme: (message) => {
      if (message.type !== "theme") return;
      theme.value = message.theme;
    },
    inspect: (message) => {
      if (message.type !== "inspect") return;
      inspecting.value = message.enabled;
    },
  };

  function onMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const message = parsePreviewMessage(event.data);
    if (message) handlers[message.type](message);
  }

  watch(theme, applyTheme);
  watch(locale, (next) => next && options.setLocale(next), { immediate: true });

  onMounted(() => {
    applyTheme(theme.value);
    window.addEventListener("message", onMessage);
    if (options.root.value) observer = observeHeight(options.root.value);
    postToParent(previewReadyMessage());
  });
  onBeforeUnmount(() => {
    window.removeEventListener("message", onMessage);
    observer?.disconnect();
  });

  return {
    tree,
    revision,
    transparent,
    padding,
    inspecting,
    reportError: (message) => postToParent(previewErrorMessage(message)),
  };
}
