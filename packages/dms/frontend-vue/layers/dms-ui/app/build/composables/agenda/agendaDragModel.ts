import type { ComputedRef, Ref } from "vue";
import type { AgendaPendingItem } from "../../../types/full-agenda";
import type { AgendaDayKey, AgendaOccurrence } from "./agendaModel";

/** Where the pointer is over a view, snapped. */
export interface AgendaDropTarget {
  day: AgendaDayKey;
  /** Minutes from midnight; absent over a day cell (month, year, all-day row, timeline by day). */
  minutes?: number;
  resourceId?: string;
  /** Over the all-day row or a day cell. */
  allDay?: boolean;
  /** Over a named slot (timeline by slot). */
  slotIndex?: number;
  /** Over the sidebar's pending items (unschedule). */
  pending?: boolean;
  /**
   * Over the time grid's all-day row: a timed event dropped here becomes an
   * all-day one. Over any other day alone (a month or year cell, a timeline
   * by day) an event keeps its kind and its time of day.
   */
  asAllDay?: boolean;
  /**
   * Over the row of the events planned on no resource (a timeline's "No
   * resource" row): a drop there clears the event's resources.
   */
  unassigned?: true;
  /**
   * The instant under the pointer, epoch ms, where the view knows it (a
   * timeline by hour). It tells apart the two 02:30 of a fall-back day,
   * which `day` + `minutes` cannot; snapped like `minutes` on a click.
   */
  instant?: number;
}

/** What a view reports a point is over. Each view registers one surface per scrolling area. */
export interface AgendaDropSurface {
  el: HTMLElement;
  /**
   * Where the pointer is. Report the raw time under it (`minutes` need not
   * be snapped: the drag engine snaps, and keeps the grab point of a move).
   */
  resolve: (clientX: number, clientY: number) => AgendaDropTarget | null;
  /** The element that scrolls near its edges while dragging. Defaults to `el` or its first scrolling ancestor. */
  scroller?: HTMLElement;
  /**
   * The part of the scroller where the surface shows, in client pixels (the
   * time grid's body under its sticky header, beside its sticky gutter):
   * dragging near its edges scrolls. Defaults to the scroller's box.
   */
  viewport?: () => AgendaSurfaceViewport;
}

/** A visible box, in client pixels. */
export interface AgendaSurfaceViewport {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export type AgendaDragKind =
  | "move"
  | "resizeStart"
  | "resizeEnd"
  | "create"
  | "select"
  | "external";

/** The placement a drag would give, drawn by the views while dragging. */
export interface AgendaDragPreview {
  kind: AgendaDragKind;
  /** The occurrence moved or resized. */
  occurrenceKey?: string;
  /** The pending item dragged in. */
  itemId?: string;
  start: number;
  end: number;
  allDay: boolean;
  resourceIds: string[];
  /** A drop here is refused (constraints, allowed resources, read-only resource). */
  valid: boolean;
  /** Why, shown next to the preview. */
  reason?: string;
  /** Alt held with `copyOnAltDrag`. */
  copy: boolean;
  /** Over the pending items: the drop unschedules. */
  toPending: boolean;
}

/** The pointer drags of the agenda (move, resize, create, range select, pending items). */
export interface AgendaDragController {
  preview: Ref<AgendaDragPreview | null>;
  /** A drag is past its threshold (a click is not a drag). */
  active: ComputedRef<boolean>;
  registerSurface: (surface: AgendaDropSurface) => () => void;
  /** pointerdown on an event's body (`move`) or edge (`resizeStart` / `resizeEnd`). */
  startOccurrence: (
    event: PointerEvent,
    occurrence: AgendaOccurrence,
    kind: "move" | "resizeStart" | "resizeEnd",
  ) => void;
  /** pointerdown on an empty spot: creates (`create.trigger: "drag"`) or selects a range. */
  startEmpty: (event: PointerEvent, target: AgendaDropTarget) => void;
  /** pointerdown on a pending item of the sidebar. */
  startPending: (event: PointerEvent, item: AgendaPendingItem) => void;
  cancel: () => void;
  /**
   * The keyboard alternative on a focused event: Alt+↑/↓ moves it by the
   * snap, Alt+←/→ by a day, Alt+Shift+↑/↓ changes its end. True when the
   * key was one of them (the caller prevents its default).
   */
  nudge: (event: KeyboardEvent, occurrence: AgendaOccurrence) => boolean;
  /** The last drag result or refusal, for a polite live region of the block. */
  announcement: Ref<string>;
  /**
   * The occurrence being moved or resized, from the threshold to the drop:
   * its chip dims. Changes twice per drag, so chips read it, not `preview`.
   */
  draggingKey: ComputedRef<string | null>;
  /**
   * Plans a pending item without a pointer (the keyboard): through the
   * rules and the placement of a drop (slots, `durationSlots`, hidden days,
   * allowed resources, read-only calendars, constraints). With `target`,
   * there; without, on the first free spot within the open hours of the
   * anchor day (the next shown day when it is hidden; its slots or times,
   * the allowed resources in order). Resolves `noRoom` when no spot fits and `refused`
   * when the save refuses it.
   */
  planPending: (
    item: AgendaPendingItem,
    target?: AgendaDropTarget,
  ) => Promise<AgendaPlanOutcome>;
  /**
   * After a keyboard move, or the drop of an event whose chip had the focus:
   * the event whose chip takes the focus back once drawn at its new place.
   * That chip clears it.
   */
  refocusKey: Ref<string | null>;
}

/**
 * What planning a pending item came to: written, no spot allowed for it,
 * or a spot found that the save refused.
 */
export type AgendaPlanOutcome = "planned" | "noRoom" | "refused";
