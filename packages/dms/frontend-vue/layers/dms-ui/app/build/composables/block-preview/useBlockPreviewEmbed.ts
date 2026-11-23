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
  previewPressMessage,
  previewReadyMessage,
  previewResizeMessage,
  previewSelectMessage,
  previewSelectPageMessage,
  previewTextMessage,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
} from "../../utils/blockPreviewMessages";
import { blockRects, documentRect, fontOf } from "./previewGeometry";
import {
  PREVIEW_FRAME_ATTRIBUTE,
  previewHeader,
  previewNavigation,
} from "./previewNavigation";
import { useBlockInspector } from "./useBlockInspector";
import { usePreviewLinks } from "./usePreviewLinks";
import { applyFixturesOnlyPolicy } from "../../utils/previewFixturesOnly";

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
  /** The route parameters the last `render` gave the blocks, for their `{{params.X}}` tokens. */
  params: Ref<Record<string, string> | undefined>;
  /** Tells the embedding page what went wrong. */
  reportError: (message: string) => void;
}

interface EmbedOptions {
  root: Readonly<ShallowRef<HTMLElement | null>>;
  initialState: PreviewState | undefined;
  setLocale: (locale: string) => void;
  /**
   * Draws a mockup on its fixtures alone: before it says `ready`, the page
   * puts on its document a policy that refuses every live route.
   */
  fixturesOnly?: boolean;
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

/** The custom property the layout's frame reads its floor height from. */
const MIN_HEIGHT_PROPERTY = "--dms-preview-min-height";

/** The preview's frame (the sidebar and the blocks) when its layout draws one, else the blocks alone. */
function frameOf(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>(`[${PREVIEW_FRAME_ATTRIBUTE}]`) ?? root;
}

/** Reports the height of the preview's frame on each change. */
function observeHeight(
  root: HTMLElement,
  onResize: () => void,
): ResizeObserver {
  const target = frameOf(root);
  const observer = new ResizeObserver(() => {
    postToParent(previewResizeMessage(target.getBoundingClientRect().height));
    onResize();
  });
  observer.observe(target);
  return observer;
}

/**
 * Calls `onChange` when the blocks under `root` may have moved without the
 * frame changing height: a block mounting after the first draw (lazy
 * components, data arriving), or the blocks growing inside a frame held at
 * its floor height.
 */
function observeBlocks(root: HTMLElement, onChange: () => void): () => void {
  const mutations = new MutationObserver(onChange);
  mutations.observe(root, { childList: true, subtree: true });
  const sizes = new ResizeObserver(onChange);
  sizes.observe(root);
  return () => {
    mutations.disconnect();
    sizes.disconnect();
  };
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
  const params = ref<Record<string, string>>();
  let observer: ResizeObserver | undefined;
  let stopObservingBlocks: (() => void) | undefined;
  let layoutFrame: number | undefined;
  let lastLayout: string | undefined;
  let isForced = false;

  function reportLayout(force = false): void {
    if (!inspecting.value) return;
    isForced ||= force;
    if (layoutFrame !== undefined) return;
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = undefined;
      const forced = isForced;
      isForced = false;
      if (!inspecting.value) return;
      const blocks = blockRects();
      const layout = JSON.stringify(blocks);
      if (!forced && layout === lastLayout) return;
      lastLayout = layout;
      postToParent(previewLayoutMessage(blocks));
    });
  }

  const links = usePreviewLinks({ inspecting, post: postToParent });
  useBlockInspector({
    enabled: inspecting,
    onSelect: (path) => postToParent(previewSelectMessage(path)),
    onSelectPage: () => postToParent(previewSelectPageMessage()),
    onText: postText,
    onFollow: links.followAnchor,
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
      previewHeader.value = message.header;
      params.value = message.params;
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
    "min-height": (message) => {
      if (message.type !== "min-height" || !options.root.value) return;
      frameOf(options.root.value).style.setProperty(
        MIN_HEIGHT_PROPERTY,
        `${message.height}px`,
      );
    },
  };

  function onObserved(): void {
    reportLayout();
  }

  function onPress(event: PointerEvent): void {
    postToParent(previewPressMessage(event.button));
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const message = parsePreviewMessage(event.data);
    if (message) handlers[message.type](message);
  }

  watch(theme, applyTheme);
  watch(revision, () => nextTick(() => reportLayout(true)));
  watch(inspecting, () => reportLayout(true));
  watch(locale, (next) => next && options.setLocale(next), { immediate: true });

  onMounted(() => {
    if (options.fixturesOnly) {
      applyFixturesOnlyPolicy(document, window.location);
    }
    applyTheme(theme.value);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onObserved);
    window.addEventListener("pointerdown", onPress, true);
    if (options.root.value) {
      observer = observeHeight(options.root.value, onObserved);
      stopObservingBlocks = observeBlocks(options.root.value, onObserved);
    }
    postToParent(previewReadyMessage());
  });
  onBeforeUnmount(() => {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("resize", onObserved);
    window.removeEventListener("pointerdown", onPress, true);
    if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame);
    observer?.disconnect();
    stopObservingBlocks?.();
  });

  return {
    tree,
    revision,
    transparent,
    padding,
    inspecting,
    params,
    reportError: (message) => postToParent(previewErrorMessage(message)),
  };
}
