import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { PreviewRect } from "../../utils/blockPreviewMessages";
import {
  isMine,
  type MockupAccess,
  type MockupAnnotation,
  type MockupAnnotationStatus,
  type MockupReply,
} from "../../utils/mockup";
import {
  isOnCanvas,
  pinDropAt,
  pinSpot,
  type FramePoint,
  type PagePoint,
  type PinCanvas,
} from "../../utils/mockupPins";
import type { MockupSession } from "./useMockupSession";

/** A point on the screen, in client pixels. */
export interface ClientPoint {
  x: number;
  y: number;
}

interface PinsOptions {
  session: MockupSession;
  /**
   * The pages on screen, each with where its blocks sit and the size of its
   * frame's document: the page in view, or every page of the overview.
   */
  canvases: ComputedRef<readonly PinCanvas[]>;
  /** The page, and the point of its frame, under a client point, wherever it is. */
  toFrame: (client: ClientPoint) => PagePoint | undefined;
  /**
   * The notes pinned on the version being previewed, each located in that
   * version's spec; undefined while the current spec is on screen.
   */
  previewed: ComputedRef<readonly MockupAnnotation[] | undefined>;
  /** Who the viewer is to the mockup: the owner changes any note, a reviewer only their own. */
  access: MockupAccess;
}

/** A note, numbered in the order the notes were left. */
export interface NumberedNote {
  note: MockupAnnotation;
  number: number;
}

/** A note drawn as a pin on a page on screen. */
export interface DrawnPin extends NumberedNote {
  page: string;
  point: FramePoint;
}

/** What a pin dropped now would be on: a block's box, or the whole page, of a page on screen. */
export type PinTarget =
  | { page: string; kind: "block"; rect: PreviewRect }
  | { page: string; kind: "page" };

/** The viewer's pins: where each shows, the one being written, and the actions on them. */
export interface MockupPins {
  /** The Comment tool is armed: the next click on a page drops a pin. */
  isPlacing: Ref<boolean>;
  /** A past version is on screen: its pins show with their status, and none can be placed, moved or changed. */
  isReadOnly: ComputedRef<boolean>;
  /** The pin being written, at a point of a page on screen. */
  draft: Ref<PagePoint | undefined>;
  /** The note whose card is open. */
  openId: Ref<string | undefined>;
  /** What each note's card held unsaved when it closed, by note id: the card opens on it again. */
  unsaved: Map<string, string>;
  drawn: ComputedRef<DrawnPin[]>;
  /** Notes whose block or page was removed. */
  tray: ComputedRef<NumberedNote[]>;
  /** The open notes of the whole mockup. */
  openCount: ComputedRef<number>;
  /** How many open notes each page shows, by page id: the pages without one are left out. */
  openByPage: ComputedRef<ReadonlyMap<string, number>>;
  /** What the pin being dragged, or the armed tool, would land on now. */
  target: ComputedRef<PinTarget | undefined>;
  togglePlacing: () => void;
  /** Follows the pointer over the pages while the tool is armed. */
  hover: (client: ClientPoint | undefined) => void;
  /** Drops the pin being written where the armed tool was clicked. */
  place: (client: ClientPoint) => void;
  saveDraft: (text: string) => Promise<void>;
  discardDraft: () => void;
  /** Starts following a pointer pressed on a pin: a drag moves it, a click opens its card. */
  press: (id: string, event: PointerEvent) => void;
  /** Opens the card of a note, or closes it when it is open. */
  toggleCard: (id: string) => void;
  setText: (id: string, text: string) => Promise<void>;
  setStatus: (id: string, status: MockupAnnotationStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reply: (id: string, text: string) => Promise<void>;
  removeReply: (id: string, replyId: string) => Promise<void>;
  /** Whether the viewer may rewrite, move or delete `note`: the owner any, a reviewer their own. */
  canChange: (note: Pick<MockupAnnotation, "author">) => boolean;
  /** Whether the viewer may delete `reply`: the owner any, a reviewer their own. */
  canRemoveReply: (reply: Pick<MockupReply, "author">) => boolean;
  /** Steps back from what is going on: the armed tool, the pin being written, the open card. False when nothing was. */
  cancel: () => boolean;
}

const DRAG_THRESHOLD_PX = 4;

/** A pointer pressed on a pin, until it is released. */
interface Press {
  id: string;
  start: ClientPoint;
  hasMoved: boolean;
  stop: () => void;
}

/** A pin away from its spot: following the pointer, or landing where it was dropped. */
interface PinInFlight {
  id: string;
  at: PagePoint | undefined;
}

/**
 * Sends every later event of the pointer pressed in `event` to the pin it was
 * pressed on. Without it, a pointer over the preview's iframe reports its
 * moves and its release to the iframe's document, and the drag never ends.
 */
function keepPointer(event: PointerEvent): void {
  const pin = event.currentTarget;
  if (pin instanceof Element && "setPointerCapture" in pin) {
    pin.setPointerCapture(event.pointerId);
  }
}

/** What the parts of the pins share: the options, the open card, and the pages on screen. */
interface PinsCore {
  options: PinsOptions;
  openId: Ref<string | undefined>;
  canvasOf: (page: string | undefined) => PinCanvas | undefined;
  /** The page and point under a client point, when it is on a page on screen. */
  pointOnPage: (client: ClientPoint) => PagePoint | undefined;
}

function pinsCore(options: PinsOptions): PinsCore {
  function canvasOf(page: string | undefined): PinCanvas | undefined {
    return options.canvases.value.find((canvas) => canvas.page.id === page);
  }
  return {
    options,
    openId: ref<string>(),
    canvasOf,
    pointOnPage: (client) => {
      const at = options.toFrame(client);
      const canvas = canvasOf(at?.page);
      return at && canvas && isOnCanvas(at.point, canvas) ? at : undefined;
    },
  };
}

/** The armed Comment tool, the pointer over the pages while it is, and the pin being written. */
function usePinPlacing(core: PinsCore) {
  const { session } = core.options;
  const isPlacing = ref(false);
  const hovered = ref<PagePoint>();
  const draft = ref<PagePoint>();

  function disarm(): void {
    isPlacing.value = false;
    hovered.value = undefined;
  }

  async function saveDraft(text: string): Promise<void> {
    const at = draft.value;
    const canvas = core.canvasOf(at?.page);
    const note = text.trim();
    if (!at || !canvas || !note) return;
    await session.addAnnotation({
      ...pinDropAt(at.point, canvas).place,
      text: note,
    });
    if (!session.hasRequestFailed.value) draft.value = undefined;
  }

  return {
    isPlacing,
    hovered,
    draft,
    disarm,
    saveDraft,
    togglePlacing: () => {
      const isArmed = !isPlacing.value;
      disarm();
      isPlacing.value = isArmed;
      if (isArmed) core.openId.value = undefined;
    },
    hover: (client: ClientPoint | undefined) => {
      hovered.value = client ? core.pointOnPage(client) : undefined;
    },
    place: (client: ClientPoint) => {
      const at = core.pointOnPage(client);
      if (!isPlacing.value || !at) return;
      disarm();
      draft.value = at;
    },
  };
}

/**
 * A pointer pressed on a pin: past a few pixels it drags the pin, which a
 * release on a page moves there; else the press is a click that opens or
 * closes its card.
 */
function usePinPress(core: PinsCore) {
  const dragged = ref<PinInFlight>();
  const landing = ref<PinInFlight>();
  let pressed: Press | undefined;

  function toggleCard(id: string): void {
    core.openId.value = core.openId.value === id ? undefined : id;
  }

  async function move(id: string, at: PagePoint): Promise<void> {
    const canvas = core.canvasOf(at.page);
    if (!canvas) return;
    landing.value = { id, at };
    await core.options.session.updateAnnotation(id, {
      place: pinDropAt(at.point, canvas).place,
    });
    if (landing.value?.id === id) landing.value = undefined;
  }

  function abandon(): void {
    pressed?.stop();
    pressed = undefined;
    dragged.value = undefined;
  }

  function release(event: PointerEvent): void {
    const press = pressed;
    abandon();
    if (!press) return;
    if (!press.hasMoved) {
      toggleCard(press.id);
      return;
    }
    const at = core.pointOnPage({ x: event.clientX, y: event.clientY });
    if (at) move(press.id, at).catch(() => undefined);
  }

  function follow(event: PointerEvent): void {
    const press = pressed;
    if (!press) return;
    const distance = Math.hypot(
      event.clientX - press.start.x,
      event.clientY - press.start.y,
    );
    if (!press.hasMoved && distance < DRAG_THRESHOLD_PX) return;
    press.hasMoved = true;
    core.openId.value = undefined;
    dragged.value = {
      id: press.id,
      at: core.pointOnPage({ x: event.clientX, y: event.clientY }),
    };
  }

  function press(id: string, event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    abandon();
    keepPointer(event);
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", abandon);
    pressed = {
      id,
      start: { x: event.clientX, y: event.clientY },
      hasMoved: false,
      stop: () => {
        window.removeEventListener("pointermove", follow);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", abandon);
      },
    };
  }

  onBeforeUnmount(abandon);

  return { dragged, landing, press, toggleCard };
}

/**
 * `previewed` as it stands now: where it was in its version, with the text and
 * status of `live`, which the AI may have changed since it was fetched.
 */
function previewedAsLive(
  previewed: MockupAnnotation,
  live: MockupAnnotation,
): MockupAnnotation {
  return { ...live, page: previewed.page, path: previewed.path };
}

/**
 * The notes on screen with their numbers, which are their ranks among every
 * note of the mockup: the open ones on the current spec, else the ones pinned
 * on the version previewed, resolved ones included, without those deleted.
 */
function usePinNotes(options: PinsOptions) {
  const annotations = options.session.annotations;
  return computed((): NumberedNote[] => {
    const numbered = annotations.value.map((note, index) => ({
      note,
      number: index + 1,
    }));
    const previewed = options.previewed.value;
    if (!previewed)
      return numbered.filter(({ note }) => note.status === "open");
    return previewed.flatMap((note) => {
      const live = numbered.find((entry) => entry.note.id === note.id);
      return live
        ? [{ note: previewedAsLive(note, live.note), number: live.number }]
        : [];
    });
  });
}

/** How many of `notes` are open on each page. */
function countOpenByPage(
  notes: readonly NumberedNote[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { note } of notes) {
    if (note.status !== "open" || note.page === undefined) continue;
    counts.set(note.page, (counts.get(note.page) ?? 0) + 1);
  }
  return counts;
}

/** Where each note shows: a pin on a page on screen, or the tray; and how many are open. */
function usePinViews(
  core: PinsCore,
  numbered: ComputedRef<NumberedNote[]>,
  inFlight: {
    dragged: Ref<PinInFlight | undefined>;
    landing: Ref<PinInFlight | undefined>;
  },
) {
  const annotations = core.options.session.annotations;

  function shownAt(entry: NumberedNote): PagePoint[] {
    const away = [inFlight.dragged.value, inFlight.landing.value].find(
      (pin) => pin?.id === entry.note.id && pin.at,
    )?.at;
    if (away) return [away];
    const canvas = core.canvasOf(entry.note.page);
    if (!canvas) return [];
    const spot = pinSpot(entry.note, canvas);
    return spot.kind === "canvas"
      ? [{ page: canvas.page.id, point: spot.point }]
      : [];
  }

  return {
    drawn: computed((): DrawnPin[] =>
      numbered.value.flatMap((entry) =>
        shownAt(entry).map((at) => ({ ...entry, ...at })),
      ),
    ),
    tray: computed(() =>
      numbered.value.filter(({ note }) => note.page === undefined),
    ),
    openCount: computed(
      () => annotations.value.filter((note) => note.status === "open").length,
    ),
    openByPage: computed(() => countOpenByPage(numbered.value)),
  };
}

/**
 * The pins of the viewer. Each open note shows on its block or page at its
 * offset, on whichever page on screen it belongs to; a note whose block or
 * page is gone waits in the tray. A drop, of a new pin or a moved one, is on
 * the innermost block under it, else on the page, of the page it lands on.
 * While a past version is previewed, the pins pinned on that version show
 * instead, resolved ones too, and nothing can be placed, moved or changed.
 * The owner changes any note; a reviewer resolves, reopens and replies to
 * any, and rewrites, moves or deletes only their own: the backend refuses
 * the rest, so the cards offer only what the viewer may do.
 */
export function useMockupPins(options: PinsOptions): MockupPins {
  const { session } = options;
  const core = pinsCore(options);
  const { openId } = core;
  const isReadOnly = computed(() => options.previewed.value !== undefined);
  const placing = usePinPlacing(core);
  const pressing = usePinPress(core);
  const notes = usePinNotes(options);
  const views = usePinViews(core, notes, pressing);

  const target = computed((): PinTarget | undefined => {
    const at = pressing.dragged.value
      ? pressing.dragged.value.at
      : placing.isPlacing.value
        ? placing.hovered.value
        : undefined;
    const canvas = core.canvasOf(at?.page);
    if (!at || !canvas) return undefined;
    const drop = pinDropAt(at.point, canvas);
    return drop.block
      ? { page: at.page, kind: "block", rect: drop.block }
      : { page: at.page, kind: "page" };
  });

  const shownPagesKey = computed(() =>
    options.canvases.value.map((canvas) => canvas.page.id).join("\n"),
  );

  function dropWhatLeft(): void {
    if (!core.canvasOf(placing.draft.value?.page)) {
      placing.draft.value = undefined;
    }
    const open = notes.value.find(({ note }) => note.id === openId.value);
    if (open?.note.page !== undefined && !core.canvasOf(open.note.page)) {
      openId.value = undefined;
    }
  }

  watch(shownPagesKey, dropWhatLeft);
  watch(isReadOnly, () => {
    placing.draft.value = undefined;
    openId.value = undefined;
  });
  watch([isReadOnly, placing.isPlacing], ([isLocked, isArmed]) => {
    if (isLocked && isArmed) placing.disarm();
  });

  function cancel(): boolean {
    const isArmed = placing.isPlacing.value;
    const hasDraft = placing.draft.value !== undefined;
    if (isArmed) placing.disarm();
    else if (hasDraft) placing.draft.value = undefined;
    else if (openId.value) openId.value = undefined;
    else return false;
    return true;
  }

  return {
    isPlacing: placing.isPlacing,
    isReadOnly,
    draft: placing.draft,
    openId,
    unsaved: new Map(),
    ...views,
    target,
    togglePlacing: placing.togglePlacing,
    hover: placing.hover,
    place: placing.place,
    saveDraft: placing.saveDraft,
    discardDraft: () => {
      placing.draft.value = undefined;
    },
    press: pressing.press,
    toggleCard: pressing.toggleCard,
    setText: (id, text) => session.updateAnnotation(id, { text }),
    setStatus: async (id, status) => {
      await session.updateAnnotation(id, { status });
      if (status === "resolved") openId.value = undefined;
    },
    remove: async (id) => {
      await session.deleteAnnotation(id);
      if (openId.value === id) openId.value = undefined;
    },
    reply: (id, text) => session.addReply(id, { text }),
    removeReply: (id, replyId) => session.deleteReply(id, replyId),
    canChange: (note) =>
      options.access.role === "owner" ||
      isMine(note.author, options.access.userId),
    canRemoveReply: (reply) =>
      options.access.role === "owner" ||
      isMine(reply.author, options.access.userId),
    cancel,
  };
}
