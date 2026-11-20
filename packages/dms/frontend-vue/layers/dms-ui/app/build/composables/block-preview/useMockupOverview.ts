import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { useResizeObserver, useTimeoutFn } from "@vueuse/core";
import { isReducedMotionActive } from "../../../utils/reducedMotion";
import type { PreviewBlockRect } from "../../utils/blockPreviewMessages";
import type { MockupCategory, MockupPageState } from "../../utils/mockup";
import {
  assignSlots,
  fitCamera,
  framesBounds,
  layoutSections,
  nearbyFrames,
  pageAt,
  revealCamera,
  zoomAt,
  type OverviewCamera,
  type OverviewFrame,
  type OverviewSectionLabel,
  type ViewportPoint,
  type ViewportSize,
} from "../../utils/mockupOverview";
import type { PagePoint, PinCanvas } from "../../utils/mockupPins";
import { groupSections } from "../../utils/mockupSections";
import { pageForest } from "../../utils/mockupPageTree";
import type { ClientPoint } from "./useMockupPins";

/** How many pages the overview draws live at once, each in an iframe of its own. */
const LIVE_FRAMES = 10;

/** The room kept between the viewport's edges and the frames a fit or a reveal shows, titles included. */
const FIT_PADDING_PX = 56;

/** The room a fit keeps once the frames sit under section titles, which stand above their pages' titles. */
const SECTIONED_FIT_PADDING_PX = 96;

/** How much one step of the zoom buttons zooms. */
const ZOOM_STEP = 1.5;

/** How long the camera eases to where a control sent it. */
const EASE_MS = 220;

/** How long the camera stays still before the live frames follow it: longer than an ease, shorter than a pause to look. */
const REST_MS = 250;

/** What a live frame's preview last said about its page. */
export interface OverviewReport {
  /** The height of the page's document. */
  height?: number;
  /** Where each block of the page sits. */
  blocks?: PreviewBlockRect[];
}

interface OverviewOptions {
  /** The mockup's name, which keeps its camera apart from another mockup's. */
  name: string;
  /** Whether the Overview is on screen: the mockup's home, while no page is open. */
  isOpen: Readonly<Ref<boolean>>;
  /** The pages to lay out, in the sidebar's order: a previewed version's while one is. A table's generated form pages, which no spec page holds, are left out. */
  pages: ComputedRef<readonly MockupPageState[]>;
  /** The sidebar's sections, a row of frames each. */
  categories: ComputedRef<readonly MockupCategory[]>;
}

/** What labels a section's row: its category, none for the default section. */
export interface OverviewSectionTitle {
  category?: MockupCategory;
}

/** The overview of every page of the mockup: where each frame sits, where the camera looks, and which frames are drawn live. */
export interface MockupOverview {
  frames: ComputedRef<OverviewFrame[]>;
  /** The label above each section's frames; none for a mockup without sections. */
  labels: ComputedRef<OverviewSectionLabel<OverviewSectionTitle>[]>;
  camera: Readonly<Ref<OverviewCamera>>;
  /**
   * The page each live slot draws. A slot is one iframe, kept across the
   * pages it draws; a page without a slot shows as a placeholder.
   */
  slots: Readonly<Ref<(string | undefined)[]>>;
  /** Every page as the pins read it: its blocks, once its live frame reported them, and its frame's size. */
  canvases: ComputedRef<PinCanvas[]>;
  /** Hands the overview the element its frames are drawn in, or null once it is gone. */
  attach: (element: Element | null) => void;
  /** The page, and the point of its frame, under a point of the screen. */
  toFrame: (client: ClientPoint) => PagePoint | undefined;
  /** Records what the live frame of `page` reported. */
  report: (page: string, report: OverviewReport) => void;
  /** Records that the iframe of a live slot booted, which lets the next one boot. */
  booted: (slot: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** Zooms by `factor` around a point of the screen, or the middle of the viewport. */
  zoomBy: (factor: number, client?: ClientPoint) => void;
  /** One step in or out, around the middle of the viewport. */
  step: (direction: 1 | -1) => void;
  /** Shows every page, and keeps showing them all as their heights come in, until the camera is moved. */
  fitAll: () => void;
  /** Pans the least that shows the frame of `page`. */
  reveal: (page: string) => void;
}

/** The camera between `from` and `to`, `progress` of the way. */
function between(
  from: OverviewCamera,
  to: OverviewCamera,
  progress: number,
): OverviewCamera {
  const at = (start: number, end: number) => start + (end - start) * progress;
  return {
    x: at(from.x, to.x),
    y: at(from.y, to.y),
    zoom: at(from.zoom, to.zoom),
  };
}

/** The camera, and its easing to where a control sends it, which reduced motion skips. */
function useCamera(camera: Ref<OverviewCamera>) {
  let easing: number | undefined;

  function stop(): void {
    if (easing !== undefined) cancelAnimationFrame(easing);
    easing = undefined;
  }

  function jump(next: OverviewCamera): void {
    stop();
    camera.value = next;
  }

  function ease(next: OverviewCamera): void {
    if (isReducedMotionActive()) {
      jump(next);
      return;
    }
    stop();
    const from = camera.value;
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / EASE_MS);
      camera.value = between(from, next, 1 - (1 - progress) ** 3);
      easing = progress < 1 ? requestAnimationFrame(frame) : undefined;
    };
    easing = requestAnimationFrame(frame);
  }

  onBeforeUnmount(stop);

  return { camera, jump, ease };
}

/** The element the frames are drawn in, its size, and where a point of the screen falls on it. */
function useViewport() {
  const element = shallowRef<HTMLElement>();
  const size = ref<ViewportSize>({ width: 0, height: 0 });
  useResizeObserver(element, ([entry]) => {
    size.value = {
      width: entry?.contentRect.width ?? 0,
      height: entry?.contentRect.height ?? 0,
    };
  });
  return {
    size,
    hasSize: computed(() => size.value.width > 0 && size.value.height > 0),
    attach: (next: Element | null) => {
      element.value = next instanceof HTMLElement ? next : undefined;
    },
    middle: (): ViewportPoint => ({
      x: size.value.width / 2,
      y: size.value.height / 2,
    }),
    toViewport: (client: ClientPoint): ViewportPoint => {
      const box = element.value?.getBoundingClientRect();
      return { x: client.x - (box?.left ?? 0), y: client.y - (box?.top ?? 0) };
    },
  };
}

type Viewport = ReturnType<typeof useViewport>;

/**
 * Where each frame sits, from the heights the live frames reported, and each
 * page as the pins read it, from the block layouts they reported. Both are
 * kept per page, so they outlive the iframe that reported them.
 */
function usePageReports(options: OverviewOptions) {
  const pages = computed(() =>
    options.pages.value.filter((page) => !page.generated),
  );
  const heights = shallowRef<ReadonlyMap<string, number>>(new Map());
  const layouts = shallowRef<ReadonlyMap<string, PreviewBlockRect[]>>(
    new Map(),
  );
  const layout = computed(() => {
    const categories = options.categories.value;
    const isSectioned = categories.length > 0;
    const forest = pageForest(pages.value, {
      idOf: (page) => page.id,
      parentOf: (page) => page.parent,
    });
    const sections = groupSections(
      categories,
      forest.roots,
      (page) => page.category,
    );
    return layoutSections<OverviewSectionTitle>(
      sections.map((section) => ({
        ...(isSectioned && { label: { category: section.category } }),
        pages: section.pages
          .flatMap((page) => [
            page,
            ...forest.descendants(page.id).map((child) => child.page),
          ])
          .map((page) => ({
            id: page.id,
            height: heights.value.get(page.id),
          })),
      })),
    );
  });
  const frames = computed(() => layout.value.frames);
  const labels = computed(() => layout.value.labels);
  const canvases = computed((): PinCanvas[] =>
    pages.value.flatMap((page) => {
      const frame = frames.value.find((entry) => entry.id === page.id);
      if (!frame) return [];
      const blocks = layouts.value.get(page.id) ?? [];
      return [
        { page, blocks, width: frame.rect.width, height: frame.rect.height },
      ];
    }),
  );
  function report(page: string, { height, blocks }: OverviewReport): void {
    if (height !== undefined && heights.value.get(page) !== height) {
      heights.value = new Map(heights.value).set(page, height);
    }
    if (blocks) layouts.value = new Map(layouts.value).set(page, blocks);
  }
  return { frames, labels, canvases, report, layouts };
}

/** The pages the live slots are handed out among: where each sits, and which reported its blocks. */
interface LiveSlotPages {
  frames: ComputedRef<OverviewFrame[]>;
  layouts: Readonly<Ref<ReadonlyMap<string, PreviewBlockRect[]>>>;
}

/**
 * The pages drawn live while the overview is open: the nearest ones, each
 * holding a slot, at most {@link LIVE_FRAMES}. The iframes of the overview
 * share the window's main thread, so the pool grows by one iframe at a time,
 * once every iframe it has booted: the page nearest the middle draws first,
 * and the canvas keeps answering while the others boot. With more pages
 * nearby than slots, a page never drawn goes first, so every page draws once
 * and the ones past the cap keep that drawing as a snapshot. While the camera
 * moves, the slots stay as they are, since an iframe drawing another page or
 * booting holds the main thread for a whole frame or more; they follow the
 * camera once it rests.
 */
function useLiveSlots(
  isOpen: Readonly<Ref<boolean>>,
  { frames, layouts }: LiveSlotPages,
  camera: Readonly<Ref<OverviewCamera>>,
  isMoving: Readonly<Ref<boolean>>,
  viewport: Viewport,
) {
  const slots = ref<(string | undefined)[]>([]);
  const booted = shallowRef<ReadonlySet<number>>(new Set());
  watch(
    [isOpen, frames, camera, isMoving, viewport.size, booted, layouts],
    () => {
      if (!isOpen.value) {
        if (slots.value.length) slots.value = [];
        if (booted.value.size) booted.value = new Set();
        return;
      }
      if (!viewport.hasSize.value || isMoving.value) return;
      const nearby = nearbyFrames(
        frames.value,
        camera.value,
        viewport.size.value,
      );
      const isDrawn = (id: string) => layouts.value.has(id);
      const wanted =
        nearby.length > LIVE_FRAMES
          ? [...nearby.filter((id) => !isDrawn(id)), ...nearby.filter(isDrawn)]
          : nearby;
      const capacity = Math.min(LIVE_FRAMES, booted.value.size + 1);
      const next = assignSlots(slots.value, wanted, capacity);
      if (next.some((id, index) => id !== slots.value[index])) {
        slots.value = next;
      }
    },
  );
  return {
    slots,
    booted: (slot: number) => {
      if (isOpen.value && !booted.value.has(slot)) {
        booted.value = new Set(booted.value).add(slot);
      }
    },
  };
}

/**
 * The camera and what moves it. It starts with every page fitted, and fitting
 * them again keeps them fitted, the camera following their bounds as heights
 * come in, until anything else moves it; the controls and the keyboard ease
 * it, the pointer moves it at once. It stays where it is while the Overview
 * is closed, so a page left goes back to the Overview as it was, and it is
 * kept by mockup, outside the viewer, which the dashboard builds again on a
 * step of the browser's history. The camera is moving from a move until it
 * has been still for {@link REST_MS}.
 */
function useCameraControls(
  name: string,
  isOpen: Readonly<Ref<boolean>>,
  frames: ComputedRef<OverviewFrame[]>,
  viewport: Viewport,
  fitPadding: ComputedRef<number>,
) {
  const { camera, jump, ease } = useCamera(
    useDmsState<OverviewCamera>(`dms.mockup.overview.camera:${name}`, () => ({
      x: 0,
      y: 0,
      zoom: 1,
    })),
  );
  const isFitted = useDmsState<boolean>(
    `dms.mockup.overview.fitted:${name}`,
    () => true,
  );
  const isMoving = ref(false);
  const rest = useTimeoutFn(
    () => {
      isMoving.value = false;
    },
    REST_MS,
    { immediate: false },
  );

  function fitted(): OverviewCamera | undefined {
    const bounds = framesBounds(frames.value);
    if (!bounds || !viewport.hasSize.value) return undefined;
    return fitCamera(bounds, viewport.size.value, fitPadding.value);
  }

  watch([isOpen, viewport.hasSize, () => framesBounds(frames.value)], () => {
    const next = isFitted.value && isOpen.value ? fitted() : undefined;
    if (next) jump(next);
  });

  function moved(next: OverviewCamera, isEased = false): void {
    isFitted.value = false;
    isMoving.value = true;
    rest.start();
    if (isEased) ease(next);
    else jump(next);
  }

  return {
    camera,
    isMoving,
    panBy: (dx: number, dy: number) =>
      moved({
        ...camera.value,
        x: camera.value.x + dx,
        y: camera.value.y + dy,
      }),
    zoomBy: (factor: number, client?: ClientPoint) => {
      const at = client ? viewport.toViewport(client) : viewport.middle();
      moved(zoomAt(camera.value, camera.value.zoom * factor, at));
    },
    step: (direction: 1 | -1) => {
      const zoom = camera.value.zoom * ZOOM_STEP ** direction;
      moved(zoomAt(camera.value, zoom, viewport.middle()), true);
    },
    fitAll: () => {
      const next = fitted();
      if (!next) return;
      ease(next);
      isFitted.value = true;
    },
    reveal: (page: string) => {
      const frame = frames.value.find((entry) => entry.id === page);
      if (!frame || !viewport.hasSize.value) return;
      const next = revealCamera(
        camera.value,
        frame.rect,
        viewport.size.value,
        FIT_PADDING_PX,
      );
      if (next.x !== camera.value.x || next.y !== camera.value.y) {
        moved(next, true);
      }
    },
  };
}

/**
 * The overview of a mockup: every page side by side as a frame at its real
 * size, on a canvas the camera pans and zooms. The frames near the view are
 * drawn live, each in one of a few iframes reused across pages; the heights
 * and block layouts they report outlive them, so a frame keeps its size, and
 * its pins their blocks, once its iframe draws another page.
 */
export function useMockupOverview(options: OverviewOptions): MockupOverview {
  const { isOpen } = options;
  const viewport = useViewport();
  const { frames, labels, canvases, report, layouts } = usePageReports(options);
  const fitPadding = computed(() =>
    labels.value.length ? SECTIONED_FIT_PADDING_PX : FIT_PADDING_PX,
  );
  const { camera, isMoving, ...moves } = useCameraControls(
    options.name,
    isOpen,
    frames,
    viewport,
    fitPadding,
  );
  const { slots, booted } = useLiveSlots(
    isOpen,
    { frames, layouts },
    camera,
    isMoving,
    viewport,
  );

  return {
    frames,
    labels,
    camera,
    slots,
    canvases,
    booted,
    attach: viewport.attach,
    toFrame: (client) =>
      pageAt(frames.value, camera.value, viewport.toViewport(client)),
    report,
    ...moves,
  };
}
