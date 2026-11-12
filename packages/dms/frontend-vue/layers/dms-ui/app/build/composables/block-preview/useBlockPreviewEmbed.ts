import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  PREVIEW_THEMES,
  type PreviewState,
  type PreviewTheme,
  type PreviewTree,
} from "../../utils/blockPreview";
import {
  parsePreviewMessage,
  previewErrorMessage,
  previewLayoutMessage,
  previewReadyMessage,
  previewResizeMessage,
  previewSelectMessage,
  previewTextMessage,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
} from "../../utils/blockPreviewMessages";
import { blockRects, documentRect, fontOf } from "./previewGeometry";
import {
  PREVIEW_FRAME_ATTRIBUTE,
  previewNavigation,
} from "./previewNavigation";
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

/**
 * Reports the height of the preview's frame (the sidebar and the blocks) when
 * its layout draws one, else of the blocks alone, on each change.
 */
function observeHeight(
  root: HTMLElement,
  onResize: () => void,
): ResizeObserver {
  const target = root.closest(`[${PREVIEW_FRAME_ATTRIBUTE}]`) ?? root;
  const observer = new ResizeObserver(() => {
    postToParent(previewResizeMessage(target.getBoundingClientRect().height));
    onResize();
  });
  observer.observe(target);
  return observer;
}

function postText(path: string, element: Element): void {
  postToParent(
    previewTextMessage({
      path,
      text: element.textContent?.trim() ?? "",
      rect: documentRect(element),
      font: fontOf(element),
    }),
  );
}

/**
 * The embed side of `/dms-preview`: reads `render` and `theme` messages from
 * the parent window, applies the theme and locale, and reports `ready`, each
 * height change and errors back to it. While inspecting, it also reports
 * where each block sits and the text a double-click lands on.
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
  let layoutFrame: number | undefined;

  function reportLayout(): void {
    if (!inspecting.value || layoutFrame !== undefined) return;
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = undefined;
      if (inspecting.value) postToParent(previewLayoutMessage(blockRects()));
    });
  }

  useBlockInspector({
    enabled: inspecting,
    onSelect: (path) => postToParent(previewSelectMessage(path)),
    onText: postText,
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
      previewNavigation.value = message.navigation;
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
  watch(revision, () => nextTick(reportLayout));
  watch(inspecting, reportLayout);
  watch(locale, (next) => next && options.setLocale(next), { immediate: true });

  onMounted(() => {
    applyTheme(theme.value);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", reportLayout);
    if (options.root.value) {
      observer = observeHeight(options.root.value, reportLayout);
    }
    postToParent(previewReadyMessage());
  });
  onBeforeUnmount(() => {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("resize", reportLayout);
    if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame);
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
