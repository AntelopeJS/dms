import type {
  AgendaBadge,
  AgendaConfirm,
  AgendaEvent,
  AgendaEventData,
  AgendaEventPatch,
  AgendaIssue,
  AgendaNotice,
  AgendaPendingItem,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState, RuleContext } from "../store";
import { plainText } from "../text";
import { mondayOf, todayKey } from "../time";
import {
  FROZEN_STATUSES,
  groupMembers,
  groupOf,
  RESTRICTED_TYPES,
  resourceName,
  taskGroupOf,
} from "./data";
import { pendingDossiers, TASK_SEEDS, type TaskSeed } from "./seed";
import {
  isWorkingDay,
  slotAt,
  slotCount,
  slotLabel,
  slotSpan,
  workingDayFrom,
} from "./slots";

const DELEGATED: AgendaBadge = { label: "⚡ Délégué", tone: "warning" };
const BLOCKED_ICON = "i-ph-link";
const MOVING_KINDS = new Set(["move", "resize", "update", "schedule"]);
/**
 * Planned on the agenda: what a task id is made of when the dossier is
 * dropped for the first time.
 */
const FIRST_TASK_SUFFIX = "-DC-1-Dessin-AP1";
const DRAGGED_KINDS = new Set(["move", "resize"]);
const LOCKED_STATUSES = new Set(["termine", "annule"]);

function readItemText(item: AgendaPendingItem, key: string): string {
  return plainText(item.data?.[key]);
}

function withoutTaskId(data: AgendaEventData | undefined): AgendaEventData {
  const { taskId: _taskId, ...rest } = data ?? {};
  return rest;
}

function readText(event: AgendaEvent, key: string): string {
  return plainText(event.data?.[key]);
}

/** "Devis Recap": a task's type and subtype. */
export function taskName(event: AgendaEvent): string {
  return `${readText(event, "tache")} ${readText(event, "sub")}`.trim();
}

function taskFromSeed(monday: string, seed: TaskSeed): AgendaEvent {
  const [id, dossier, client, commune, op, tache, sub, resource] = seed;
  const [, , , , , , , , day, slot, slots, statut, pred, remarque] = seed;
  const span = slotSpan(workingDayFrom(monday, day), slot - 1, slots);
  return {
    id,
    title: client,
    subtitle: `${op}-${tache}-${sub}`,
    resourceIds: [resource],
    ...span,
    allowedResourceIds: RESTRICTED_TYPES.has(tache)
      ? groupMembers(taskGroupOf(tache) ?? "")
      : undefined,
    data: { dossier, commune, op, tache, sub, statut, pred, remarque },
  };
}

/** The planning of the current week and the next, and the dossiers left to plan. */
export function seedPlanning(): AgendaState {
  const monday = mondayOf(todayKey());
  return {
    events: TASK_SEEDS.map((seed) => taskFromSeed(monday, seed)),
    pending: pendingDossiers(),
  };
}

function predecessorOf(
  event: AgendaEvent,
  events: AgendaEvent[],
): AgendaEvent | undefined {
  const pred = readText(event, "pred");
  return pred ? events.find((other) => other.id === pred) : undefined;
}

function startsBefore(event: AgendaEvent, other: AgendaEvent): boolean {
  return Date.parse(event.start) < Date.parse(other.end ?? other.start);
}

function isDelegated(event: AgendaEvent): boolean {
  const tache = readText(event, "tache");
  const resource = event.resourceIds?.[0];
  const expected = taskGroupOf(tache);
  return !!resource && !!expected && groupOf(resource) !== expected;
}

function issuesOf(
  event: AgendaEvent,
  pred: AgendaEvent | undefined,
): AgendaIssue[] {
  if (!pred || !startsBefore(event, pred)) return [];
  return [
    {
      tone: "error",
      message: `Commence avant la fin de son prédécesseur (${taskName(pred)}).`,
    },
  ];
}

/**
 * A task as the route answers it: its status is its calendar, a frozen one
 * is dimmed and dashed, a task waiting for an unfinished predecessor shows
 * a link, a task given outside its group is delegated, a task starting
 * before its predecessor ends carries an issue.
 */
export function decorateTask(
  event: AgendaEvent,
  state: AgendaState,
): AgendaEvent {
  const statut = readText(event, "statut") || "en-planning";
  const pred = predecessorOf(event, state.events);
  const blocked = !!pred && readText(pred, "statut") !== "termine";
  const frozen = FROZEN_STATUSES.has(statut);
  return {
    ...event,
    calendarId: statut,
    muted: frozen || undefined,
    style: frozen ? "dashed" : undefined,
    editable: LOCKED_STATUSES.has(statut) ? false : undefined,
    icon: blocked ? BLOCKED_ICON : undefined,
    badges: isDelegated(event) ? [DELEGATED] : undefined,
    issues: issuesOf(event, pred),
    description: readText(event, "remarque") || undefined,
  };
}

function restrictionOf(event: AgendaEvent): string | undefined {
  const tache = readText(event, "tache");
  const resource = event.resourceIds?.[0];
  if (!resource || !RESTRICTED_TYPES.has(tache)) return undefined;
  const allowed = groupMembers(taskGroupOf(tache) ?? "");
  if (allowed.includes(resource)) return undefined;
  const names = allowed.map(resourceName).join(", ");
  return `Un ${tache} ne se confie qu'à ${names} : ${resourceName(resource)} ne peut pas le prendre.`;
}

/**
 * Why a task may not be written: a finished or cancelled one stays where it
 * is; a task takes one resource, a working day, a slot start, and a
 * resource of its group for drawings, quotes and transports.
 */
export function refuseTask(
  event: AgendaEvent,
  { change, before }: RuleContext,
): string | undefined {
  const locked = before && LOCKED_STATUSES.has(readText(before, "statut"));
  if (locked && DRAGGED_KINDS.has(change.kind)) {
    return "Tâche terminée ou annulée : elle n'est plus replanifiée.";
  }
  if ((event.resourceIds?.length ?? 0) !== 1) {
    return "Une tâche est confiée à une seule ressource.";
  }
  const slot = slotAt(event.start);
  if (!slot) {
    return "Une tâche commence au début d'un créneau : S1 08:00, S2 10:00, S3 13:00 ou S4 15:00.";
  }
  if (!isWorkingDay(slot.day)) {
    return "Le planning ne compte que les jours ouvrables.";
  }
  return restrictionOf(event);
}

function successorsOf(event: AgendaEvent, events: AgendaEvent[]) {
  return events.filter((other) => readText(other, "pred") === event.id);
}

/**
 * The question of a task moved before its predecessor ends, or past the
 * start of a task that follows it.
 */
export function confirmTask(
  event: AgendaEvent,
  { change, state, before }: RuleContext,
): AgendaConfirm | undefined {
  if (!MOVING_KINDS.has(change.kind)) return undefined;
  /**
   * A remark or a status edited on a task already out of order asks nothing.
   */
  if (before && !movedInTime(before, event)) return undefined;
  const pred = predecessorOf(event, state.events);
  if (pred && startsBefore(event, pred)) {
    return {
      title: `${event.title} : ${taskName(event)} avant ${taskName(pred)} ?`,
      message: `${taskName(pred)} (${resourceName(pred.resourceIds?.[0] ?? "")}) est planifié ${slotLabel(pred.start)} : ${taskName(event)} commencerait avant qu'il soit fini. Planifier quand même ?`,
      confirmLabel: "Planifier quand même",
    };
  }
  const next = successorsOf(event, state.events).find((other) =>
    startsBefore(other, event),
  );
  if (!next) return undefined;
  return {
    title: `${event.title} : ${taskName(event)} après ${taskName(next)} ?`,
    message: `${taskName(next)} commence ${slotLabel(next.start)} et attend ${taskName(event)}. Planifier quand même ?`,
    confirmLabel: "Planifier quand même",
  };
}

/** Whether a change moved a task in time (its start or its end). */
export function movedInTime(before: AgendaEvent, after: AgendaEvent): boolean {
  return (
    Date.parse(before.start) !== Date.parse(after.start) ||
    Date.parse(before.end ?? before.start) !==
      Date.parse(after.end ?? after.start)
  );
}

/**
 * The task a pending item becomes once dropped: a task dragged back keeps
 * its id and its predecessor; a dossier waiting for its first drawing
 * becomes its Dessin AP1.
 */
export function scheduleDossier(
  item: AgendaPendingItem,
  patch: AgendaEventPatch,
): AgendaEvent {
  const slot = patch.start ? slotAt(patch.start) : undefined;
  const span = slot
    ? slotSpan(slot.day, slot.index, item.durationSlots ?? 1)
    : undefined;
  return {
    id: readItemText(item, "taskId") || `${item.id}${FIRST_TASK_SUFFIX}`,
    title: item.title,
    subtitle: item.subtitle,
    start: patch.start ?? "",
    end: patch.end ?? span?.end,
    resourceIds: patch.resourceIds,
    allowedResourceIds: item.allowedResourceIds,
    data: { pred: "", ...withoutTaskId(item.data) },
  };
}

/**
 * The pending item a task becomes once dragged back to the list: named by
 * the task (two tasks of one dossier are two items), which it gets back
 * when dropped again.
 */
export function unscheduleTask(event: AgendaEvent): AgendaPendingItem {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    calendarId: "en-planning",
    durationSlots: event.end ? slotCount(event.start, event.end) : 1,
    allowedResourceIds: event.allowedResourceIds,
    data: { ...event.data, taskId: event.id },
  };
}

/** The tasks of the same dossier, whose links and issues follow a move. */
export function sameDossier(
  event: AgendaEvent,
  state: AgendaState,
): AgendaEvent[] {
  const dossier = readText(event, "dossier");
  return state.events.filter(
    (other) => other.id !== event.id && readText(other, "dossier") === dossier,
  );
}

/** The sidebar's checks: every task planned before its predecessor ends. */
export function planningNotices(state: AgendaState): AgendaNotice[] {
  return state.events.flatMap((event) => {
    const pred = predecessorOf(event, state.events);
    if (!pred || !startsBefore(event, pred)) return [];
    return [
      {
        id: `order-${event.id}`,
        tone: "error" as const,
        message: `${event.title} : ${taskName(event)} commence avant ${taskName(pred)}`,
        eventId: event.id,
      },
    ];
  });
}
