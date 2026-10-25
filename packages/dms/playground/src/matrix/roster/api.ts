import { Controller, Get, JSONBody, Post } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellError,
  MatrixCellState,
  MatrixChange,
  MatrixData,
  MatrixGroup,
  MatrixRow,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { cellError, readSaveRequest, rowError } from "../save";
import {
  MAX_WORKING_DAYS,
  PEOPLE,
  type Person,
  resetRoster,
  type Shift,
  SHIFT_HOURS,
  SHIFT_OPTIONS,
  type StoreTeam,
  TEAMS,
  WEEK,
} from "./data";
import { MATRIX_ROSTER_API, PageMatrixRoster } from "./page";

const HOURS_DECIMALS = 1;

function isShift(value: MatrixChange["value"]): value is Shift {
  return SHIFT_OPTIONS.some((option) => option.value === value);
}

function hours(value: number): string {
  return `${value.toFixed(HOURS_DECIMALS).replace(".", ",")} h`;
}

function plannedHours(person: Person): number {
  return WEEK.reduce((total, day) => {
    const shift = person.week[day.id];
    return total + (shift ? (SHIFT_HOURS[shift] ?? 0) : 0);
  }, 0);
}

function workingDays(week: Person["week"]): number {
  return WEEK.filter((day) => {
    const shift = week[day.id];
    return !!shift && !!SHIFT_HOURS[shift];
  }).length;
}

function closedCells(): Record<string, MatrixCellState> {
  return Object.fromEntries(
    WEEK.filter((day) => day.isClosed).map((day) => [
      day.id,
      { disabled: true },
    ]),
  );
}

function personRow(person: Person): MatrixRow {
  const planned = plannedHours(person);
  return {
    id: person.id,
    label: person.name,
    description: `${person.role} · ${hours(planned)} / ${person.contractHours} h`,
    group: person.store,
    values: Object.fromEntries(
      WEEK.map((day) => [day.id, person.week[day.id] ?? null]),
    ),
    cells: closedCells(),
    // Planned past the contract: overtime to pay, or a mistake.
    tone: planned > person.contractHours ? "warning" : undefined,
  };
}

function teamGroup(team: StoreTeam): MatrixGroup {
  const members = PEOPLE.filter((person) => person.store === team.id);
  return {
    id: team.id,
    label: team.label,
    description: team.description,
    badge: `${members.length} personnes`,
  };
}

function teamHours(team: StoreTeam): string {
  const total = PEOPLE.filter((person) => person.store === team.id).reduce(
    (sum, person) => sum + plannedHours(person),
    0,
  );
  return `${team.id} ${hours(total)}`;
}

function shiftProblem(
  person: Person,
  change: MatrixChange,
): string | undefined {
  const day = WEEK.find((candidate) => candidate.id === change.columnId);
  if (!day) return "Jour inconnu.";
  if (day.isClosed) return "Les magasins sont fermés ce jour-là.";
  if (!isShift(change.value))
    return "Choisissez un horaire, Repos ou une absence.";
  const days = workingDays({ ...person.week, [day.id]: change.value });
  if (days > MAX_WORKING_DAYS) {
    return `${person.name} travaillerait ${days} jours cette semaine : ${MAX_WORKING_DAYS} au maximum. Posez d'abord un repos un autre jour.`;
  }
  return undefined;
}

function applyShift(change: MatrixChange): MatrixCellError | undefined {
  const person = PEOPLE.find((candidate) => candidate.id === change.rowId);
  if (!person)
    return rowError(
      change.rowId,
      "Cette personne ne fait plus partie de l'équipe.",
    );
  const problem = shiftProblem(person, change);
  if (problem) return cellError(change, problem);
  if (isShift(change.value)) person.week[change.columnId] = change.value;
  return undefined;
}

/**
 * The routes of the "Roster" demo: a team's week, one shift per person and
 * day. The save refuses a sixth working day and the closed Sunday, per
 * cell; each row's description sums the hours planned against the contract.
 */
export class MatrixRosterController extends Controller(MATRIX_ROSTER_API) {
  @AuthUserWithPermission(PageMatrixRoster)
  declare user: User;

  @Get("rows")
  list(): MatrixData {
    return {
      rows: PEOPLE.map(personRow),
      groups: TEAMS.map(teamGroup),
      footer: `Heures planifiées cette semaine : ${TEAMS.map(teamHours).join(" · ")}.`,
    };
  }

  @Post("save")
  save(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const { changes } = readSaveRequest(body);
    const errors = changes
      .map(applyShift)
      .filter((error): error is MatrixCellError => !!error);
    const rowIds = new Set(changes.map((change) => change.rowId));
    return {
      rows: PEOPLE.filter((person) => rowIds.has(person.id)).map(personRow),
      errors,
    };
  }

  @Post("reset")
  reset() {
    resetRoster();
    return { message: "Planning remis à zéro" };
  }
}
