// The pointer drags of every view: moving and resizing events, picking a
// range on empty time, dragging pending items in and events back out. The
// views register their scrolling areas as surfaces and draw `preview`; the
// chips never read the pointer.

import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
} from "vue";
import type { AgendaPendingItem } from "../../../types/full-agenda";
import type {
  AgendaDragController,
  AgendaDragPreview,
  AgendaDropSurface,
  AgendaDropTarget,
  AgendaOccurrence,
} from "./agendaModel";
import { placeDrag } from "./agendaDragMath";
import type { AgendaDragSource } from "./agendaDragBasics";
import { checkDrop } from "./agendaDragRules";
import type { AgendaDropRules } from "./agendaDragRules";
import {
  edgeSpeed,
  hitSurface,
  surfaceScroller,
  surfaceViewport,
} from "./agendaDragDom";
import {
  buildPreview,
  dropRules,
  samePreview,
  viewDragConfig,
  viewNudgeContext,
} from "./agendaDragPreview";
import type { AgendaDragDeps } from "./agendaDragPreview";
import { keyStep, nudgeSource, nudgeTarget } from "./agendaDragKeys";
import { AgendaDropCommitter } from "./agendaDragCommit";

export type { AgendaDragDeps } from "./agendaDragPreview";

/** Pixels the pointer travels before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;
/** A touch drags after this hold; moving sooner scrolls. */
export const LONG_PRESS_MS = 250;
const FRAME_MS = 16;

interface DragSession {
  source: AgendaDragSource;
  title: string;
  pointerId: number;
  isTouch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  alt: boolean;
  isStarted: boolean;
  captureEl: Element | null;
  timer?: ReturnType<typeof setTimeout>;
  surface: AgendaDropSurface | null;
  rules?: AgendaDropRules;
}

/** A frame request: an animation frame in a browser, a timer elsewhere (tests, SSR). */
type FrameHandle = number | ReturnType<typeof setTimeout>;

const raf = (callback: () => void): FrameHandle =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : setTimeout(callback, FRAME_MS);

const cancelRaf = (handle: FrameHandle): void => {
  if (typeof handle === "number" && typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(handle);
  else clearTimeout(handle);
};

const WINDOW_LISTENERS = ["pointermove", "pointerup", "pointercancel"] as const;

class AgendaDragEngine {
  readonly preview = shallowRef<AgendaDragPreview | null>(null);
  readonly isActive = ref(false);
  readonly draggingKey = ref<string | null>(null);
  readonly announcement = ref("");
  private readonly surfaces: AgendaDropSurface[] = [];
  private readonly committer: AgendaDropCommitter;
  private session: DragSession | null = null;
  private frame: FrameHandle = 0;
  private scrollFrame: FrameHandle = 0;
  private bodySelect = "";

  constructor(private readonly deps: AgendaDragDeps) {
    this.committer = new AgendaDropCommitter(deps, (message) => {
      this.announcement.value = message;
    });
  }

  private computePreview(current: DragSession): AgendaDragPreview | null {
    const hit = hitSurface(this.surfaces, current.x, current.y);
    if (!hit) return null;
    current.surface = hit.surface;
    // The rules read the agenda once per drag, not on every move.
    current.rules ??= dropRules(this.deps, current.source.kind);
    return buildPreview(this.deps, {
      source: current.source,
      target: hit.target,
      alt: current.alt,
      rules: current.rules,
    });
  }

  private updatePreview(): void {
    if (!this.session?.isStarted) return;
    const next = this.computePreview(this.session);
    if (!samePreview(this.preview.value, next)) this.preview.value = next;
  }

  private readonly autoScroll = (): void => {
    this.scrollFrame = 0;
    const current = this.session;
    if (!current?.isStarted || !current.surface) return;
    const scroller = surfaceScroller(current.surface);
    if (!scroller) return;
    const rect = surfaceViewport(current.surface, scroller);
    const dx = edgeSpeed(current.x, rect.left, rect.right);
    const dy = edgeSpeed(current.y, rect.top, rect.bottom);
    if (!dx && !dy) return;
    scroller.scrollLeft += dx;
    scroller.scrollTop += dy;
    this.updatePreview();
    this.scrollFrame = raf(this.autoScroll);
  };

  private readonly activate = (): void => {
    const current = this.session;
    if (!current) return;
    current.isStarted = true;
    this.isActive.value = true;
    this.draggingKey.value = current.source.occurrence?.key ?? null;
    try {
      current.captureEl?.setPointerCapture?.(current.pointerId);
    } catch {
      // The pointer is already gone: the window listeners still follow it.
    }
    this.bodySelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    // Tooltips hide through CSS while dragging: the chips do not redraw.
    document.body.dataset.agendaDragging = "";
    this.committer.say("started", { title: current.title });
    this.updatePreview();
  };

  private listen(isOn: boolean): void {
    const method = isOn ? "addEventListener" : "removeEventListener";
    for (const type of WINDOW_LISTENERS)
      window[method](type, this.onPointer as EventListener);
    window[method]("keydown", this.onKey as EventListener, true);
    window[method]("keyup", this.onKey as EventListener, true);
    window[method]("contextmenu", this.onContextMenu, true);
    // Alt+Tab mid-drag loses the pointerup: leaving the window cancels.
    window[method]("blur", this.cancel);
    // A touch drag must stop the page from scrolling under it.
    if (isOn)
      window.addEventListener("touchmove", this.onTouchMove, {
        passive: false,
      });
    else window.removeEventListener("touchmove", this.onTouchMove);
  }

  readonly teardown = (): void => {
    const current = this.session;
    this.session = null;
    if (current?.timer) clearTimeout(current.timer);
    cancelRaf(this.frame);
    if (this.scrollFrame) cancelRaf(this.scrollFrame);
    this.scrollFrame = 0;
    if (current) this.listen(false);
    if (current?.isStarted) {
      document.body.style.userSelect = this.bodySelect;
      delete document.body.dataset.agendaDragging;
      try {
        current.captureEl?.releasePointerCapture?.(current.pointerId);
      } catch {
        // Released already.
      }
    }
    this.preview.value = null;
    this.isActive.value = false;
    this.draggingKey.value = null;
  };

  /** The click that follows a drop must not open the event or create one. */
  private swallowNextClick(): void {
    const stop = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(
      () => window.removeEventListener("click", stop, { capture: true }),
      0,
    );
  }

  private move(current: DragSession, event: PointerEvent): void {
    // A mouse moving with no button down lost its pointerup somewhere.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      this.cancel();
      return;
    }
    const moved = Math.hypot(
      current.x - current.startX,
      current.y - current.startY,
    );
    if (!current.isStarted) {
      // A touch moving before the hold is a scroll; a mouse past the threshold drags.
      if (current.isTouch) {
        if (moved > DRAG_THRESHOLD) this.teardown();
      } else if (moved >= DRAG_THRESHOLD) this.activate();
      return;
    }
    event.preventDefault();
    cancelRaf(this.frame);
    this.frame = raf(() => this.updatePreview());
    if (!this.scrollFrame) this.scrollFrame = raf(this.autoScroll);
  }

  private up(current: DragSession): void {
    if (!current.isStarted) {
      this.teardown();
      return;
    }
    this.updatePreview();
    const dropped = this.preview.value;
    this.teardown();
    this.swallowNextClick();
    this.committer.drop(current.source, current.title, dropped);
  }

  private readonly onPointer = (event: PointerEvent): void => {
    const current = this.session;
    if (!current || event.pointerId !== current.pointerId) return;
    if (event.type === "pointercancel") {
      this.teardown();
      return;
    }
    current.x = event.clientX;
    current.y = event.clientY;
    current.alt = event.altKey;
    if (event.type === "pointerup") this.up(current);
    else this.move(current, event);
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    const current = this.session;
    if (!current) return;
    if (event.key === "Escape" && event.type === "keydown") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }
    if (event.key !== "Alt") return;
    // Alt alone would focus the browser's menu bar on its release.
    event.preventDefault();
    current.alt = event.type === "keydown";
    this.updatePreview();
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (this.session?.isStarted && event.cancelable) event.preventDefault();
  };

  private readonly onContextMenu = (event: Event): void => {
    if (this.session?.isTouch) event.preventDefault();
  };

  /** A press: `origin` undefined is read under the pointer, `null` is none (a pending item). */
  begin(
    event: PointerEvent,
    source: Omit<AgendaDragSource, "origin">,
    title: string,
    origin: AgendaDropTarget | null | undefined,
  ): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.session) this.teardown();
    const isTouch = event.pointerType === "touch";
    const resolved =
      origin === undefined
        ? (hitSurface(this.surfaces, event.clientX, event.clientY)?.target ??
          null)
        : origin;
    this.session = {
      source: { ...source, origin: resolved },
      title,
      pointerId: event.pointerId,
      isTouch,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      alt: event.altKey,
      isStarted: false,
      captureEl: event.target instanceof Element ? event.target : null,
      surface: null,
    };
    if (isTouch) this.session.timer = setTimeout(this.activate, LONG_PRESS_MS);
    this.listen(true);
  }

  readonly cancel = (): void => {
    if (!this.session) return;
    const wasStarted = this.session.isStarted;
    this.teardown();
    if (!wasStarted) return;
    this.swallowNextClick();
    this.committer.say("cancelled");
  };

  /** Alt+arrows on a focused event: see {@link AgendaDragController.nudge}. */
  nudge(event: KeyboardEvent, occurrence: AgendaOccurrence): boolean {
    const step = keyStep(event);
    if (!step) return false;
    const options = this.deps.options.value;
    const isResize = event.shiftKey && step.snaps !== 0;
    if (occurrence.allDay && step.snaps !== 0) return false;
    const isAllowed = isResize
      ? options.dragResize && occurrence.canResize
      : options.dragMove && occurrence.canMove;
    if (!isAllowed) return false;
    const context = viewNudgeContext(this.deps);
    const source = nudgeSource(occurrence, isResize, context);
    const target = nudgeTarget(occurrence, step, isResize, context);
    const placement = placeDrag(source, target, viewDragConfig(this.deps));
    const refusal = checkDrop(
      {
        placement,
        occurrence,
        copy: false,
        allowedResourceIds: occurrence.event.allowedResourceIds,
        checkDuration: isResize,
      },
      dropRules(this.deps, source.kind),
    );
    const { title } = occurrence.event;
    const reason = refusal
      ? this.deps.t(`dms.agenda.drag.reason.${refusal}`)
      : undefined;
    this.committer.drop(source, title, {
      ...placement,
      kind: source.kind,
      valid: refusal === null,
      reason,
      copy: false,
      toPending: false,
    });
    return true;
  }

  registerSurface(surface: AgendaDropSurface): () => void {
    this.surfaces.push(surface);
    return () => {
      const index = this.surfaces.indexOf(surface);
      if (index !== -1) this.surfaces.splice(index, 1);
    };
  }
}

/** The drag engine of a FullAgenda: what fills `ctx.drag`. */
export function useAgendaDrag(deps: AgendaDragDeps): AgendaDragController {
  const engine = new AgendaDragEngine(deps);
  if (getCurrentScope()) onScopeDispose(engine.teardown);
  const options = () => deps.options.value;
  return {
    preview: engine.preview,
    active: computed(() => engine.isActive.value),
    registerSurface: (surface) => engine.registerSurface(surface),
    startOccurrence(event, occurrence, kind) {
      const isAllowed =
        kind === "move"
          ? options().dragMove && occurrence.canMove
          : options().dragResize && occurrence.canResize;
      if (!isAllowed) return;
      // The surface under the chip must not start a range of its own.
      event.stopPropagation();
      engine.begin(
        event,
        { kind, occurrence },
        occurrence.event.title,
        undefined,
      );
    },
    startEmpty(event, target) {
      const creates = options().canCreate && options().createTrigger === "drag";
      const selects = options().raw.rangeSelect === "drag";
      if (!creates && !selects) return;
      const resource = deps.resources.value.find(
        (candidate) => candidate.id === target.resourceId,
      );
      if (creates && resource?.editable === false) return;
      engine.begin(event, { kind: creates ? "create" : "select" }, "", target);
    },
    startPending(event, item: AgendaPendingItem) {
      if (!options().editable) return;
      engine.begin(event, { kind: "external", item }, item.title, null);
    },
    cancel: engine.cancel,
    nudge: (event, occurrence) => engine.nudge(event, occurrence),
    announcement: engine.announcement,
    draggingKey: computed(() => engine.draggingKey.value),
  };
}
