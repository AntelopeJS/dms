import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  AgendaData,
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { badRequest } from "../../matrix/save";
import { eventsFor, readAgendaQuery } from "../query";
import {
  type AgendaSaveInput,
  actionId,
  missing,
  readAgendaSave,
} from "../save";
import { AgendaStore, type AgendaState } from "../store";
import { PLANNING_GROUPS, STATUS_OPTIONS } from "./data";
import { AGENDA_PLANNING_API, PageAgendaPlanning } from "./page";
import { oneSlotLater, slotCount, slotLabel } from "./slots";
import {
  confirmTask,
  decorateTask,
  planningNotices,
  refuseTask,
  sameDossier,
  scheduleDossier,
  seedPlanning,
  unscheduleTask,
} from "./tasks";

// The task a colleague moves while the user looks at it: its first change
// meets a conflict (see `colleagueMoves`).
const COLLEAGUE_TASK = "45073-ME-1-Validation-ValCOORD";
const COLLEAGUE = "Torrekens L.";
const STATUSES = new Set(STATUS_OPTIONS.map((option) => option.value));

function completeTask(event: AgendaEvent): AgendaEvent {
  return {
    ...event,
    title: event.title || "Nouvelle tâche",
    data: {
      dossier: "",
      commune: "",
      op: "DC",
      tache: "Dessin",
      sub: "AP1",
      statut: "en-planning",
      pred: "",
      remarque: "",
      ...event.data,
    },
  };
}

const store = new AgendaStore(seedPlanning, {
  idPrefix: "planning",
  refuse: refuseTask,
  confirm: confirmTask,
  complete: completeTask,
  schedule: scheduleDossier,
  unschedule: unscheduleTask,
  decorate: decorateTask,
  related: sameDossier,
  conflictMessage: (current) =>
    `${COLLEAGUE} a replanifié cette tâche entre-temps : elle commence maintenant ${slotLabel(current.start)}.`,
});

let colleagueMoved = false;

/**
 * Plays the colleague: the first change naming the task moves it one slot
 * later before the save reads it, so a block detecting conflicts meets one.
 */
function colleagueMoves(input: AgendaSaveInput): void {
  if (colleagueMoved) return;
  if (!input.changes.some((change) => change.id === COLLEAGUE_TASK)) return;
  const task = store.find(COLLEAGUE_TASK);
  if (!task?.end) return;
  const later = oneSlotLater(task.start, slotCount(task.start, task.end));
  if (!later) return;
  colleagueMoved = true;
  store.put({ ...task, ...later });
}

function stateNow(): AgendaState {
  return { events: store.events, pending: store.pending };
}

/**
 * The routes of the "Resource planning" demo: tasks on people by slot, the
 * dossiers left to plan, the save's rules (a resource of the task's group,
 * slot starts, working days), its question when a task would start before
 * its predecessor, its conflict when a colleague moved the task meanwhile.
 */
export class AgendaPlanningController extends Controller(AGENDA_PLANNING_API) {
  @AuthUserWithPermission(PageAgendaPlanning)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return {
      events: eventsFor(store.answer(store.events), query),
      resourceGroups: PLANNING_GROUPS,
      unscheduled: store.pending,
      notices: planningNotices(stateNow()),
    };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    const input = readAgendaSave(body);
    colleagueMoves(input);
    const response = store.save(input);
    if (response.confirm) return response;
    return { ...response, notices: planningNotices(stateNow()) };
  }

  @Post("status")
  status(@Context() ctx: RequestContext) {
    const params = ctx.url.searchParams;
    const statut = params.get("statut") ?? "";
    if (!STATUSES.has(statut)) throw badRequest("Statut inconnu.");
    const task = store.find(actionId(params));
    if (!task) throw missing("Cette tâche n'existe plus.");
    store.put({ ...task, data: { ...task.data, statut } });
    return { message: `${task.title} : statut mis à jour` };
  }

  @Post("reset")
  reset() {
    store.reset();
    colleagueMoved = false;
    return { message: "Planning remis à zéro" };
  }
}
