import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { isObject } from "../../../../../dms-core/app/utils/type-check";
import {
  previewEscapeMessage,
  previewNavigateMessage,
  type PreviewOutboundMessage,
} from "../../utils/blockPreviewMessages";
import { mockupLinkOf, type MockupLink } from "../../utils/mockupLinks";

/** The event Inertia fires on `document` before each visit, cancelable. */
const VISIT_EVENT = "inertia:before";

/** Marks an open menu, popover or dialog of the page, which takes Escape itself. */
const DISMISSABLE_LAYER = "[data-dismissable-layer]";

const PRIMARY_BUTTON = 0;

interface PreviewLinksOptions {
  /** Whether a click picks a block instead of reaching it. */
  inspecting: Readonly<Ref<boolean>>;
  /** Hands the embedding page a message: the page to open, or Escape. */
  post: (message: PreviewOutboundMessage) => void;
}

/** What the inspector asks of the links: whether a Ctrl or ⌘ click followed one. */
export interface PreviewLinks {
  followAnchor: (event: MouseEvent) => boolean;
}

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null;
}

/** The URL an Inertia visit goes to, as its `before` event carries it. */
function visitUrlOf(event: Event): URL | undefined {
  if (!(event instanceof CustomEvent) || !isRecord(event.detail)) return;
  const visit = event.detail.visit;
  return isRecord(visit) && visit.url instanceof URL ? visit.url : undefined;
}

/** The page of the mockup the link under `target` opens, when it is one. */
function anchorLink(target: EventTarget | null): MockupLink | undefined {
  const anchor =
    target instanceof Element ? target.closest("a[href]") : undefined;
  const href = anchor?.getAttribute("href");
  return href ? mockupLinkOf(href, window.location.href) : undefined;
}

function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === PRIMARY_BUTTON &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Keeps the preview on its page, as a frame of the mockup viewer: a visit to
 * another page is cancelled, and when it goes to a page of the mockup, the
 * embedding page opens that page instead. A plain click on a link to a page of
 * the mockup does the same while the page is not inspected; an Inertia link
 * would visit it, a plain anchor would load it in the frame. Escape is handed
 * to the embedding page when no menu or dialog of the page is open.
 */
export function usePreviewLinks(options: PreviewLinksOptions): PreviewLinks {
  function follow(link: MockupLink): void {
    options.post(previewNavigateMessage(link.page, link.record));
  }

  function onVisit(event: Event): void {
    const url = visitUrlOf(event);
    if (!url || url.pathname === window.location.pathname) return;
    event.preventDefault();
    const link = mockupLinkOf(url.href, window.location.href);
    if (link) follow(link);
  }

  function onClick(event: MouseEvent): void {
    if (options.inspecting.value || !isPlainClick(event)) return;
    const link = anchorLink(event.target);
    if (!link) return;
    event.preventDefault();
    follow(link);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (document.querySelector(DISMISSABLE_LAYER)) return;
    options.post(previewEscapeMessage());
  }

  onMounted(() => {
    document.addEventListener(VISIT_EVENT, onVisit);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeydown, true);
  });
  onBeforeUnmount(() => {
    document.removeEventListener(VISIT_EVENT, onVisit);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeydown, true);
  });

  return {
    followAnchor: (event) => {
      const link = anchorLink(event.target);
      if (link) follow(link);
      return link !== undefined;
    },
  };
}
