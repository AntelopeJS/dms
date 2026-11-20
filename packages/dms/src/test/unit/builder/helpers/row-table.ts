import type {
  PlanOperand,
  PlanRow,
  PlanStream,
  PlanValue,
} from "../../../../implementations/dms-builder/engine";
import {
  isNumber,
  isString,
} from "../../../../implementations/dms-builder/engine/scalar-guards";

/** What a stored row holds in one field. */
export type TableCell = string | number | boolean | Date | null;

/** One stored row, by field name. */
export type TableRow = Record<string, TableCell>;

function notDriven(name: string): never {
  throw new Error(`the row table does not drive ${name}`);
}

/** A stored value as a number that orders it: a date by its instant, anything else as it is. */
function ordinal(value: TableCell | PlanOperand): number | string | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (isString(value)) {
    const instant = Date.parse(value);
    return Number.isNaN(instant) ? value : instant;
  }
  return isNumber(value) ? value : undefined;
}

function compared(
  left: TableCell,
  right: PlanOperand,
  holds: (order: number) => boolean,
): Held {
  const near = ordinal(left);
  const far = ordinal(right);
  if (near === undefined || far === undefined) {
    return new Held(holds(left === right ? 0 : 1));
  }
  if (near === far) {
    return new Held(holds(0));
  }
  return new Held(holds(near < far ? -1 : 1));
}

/**
 * A value of a stored row as the query sees it. A comparison answers another
 * `Held`, whose value is whether the row passed.
 */
class Held implements PlanValue {
  constructor(readonly value: TableCell) {}

  eq(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order === 0);
  }

  ne(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order !== 0);
  }

  gt(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order > 0);
  }

  ge(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order >= 0);
  }

  lt(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order < 0);
  }

  le(operand: PlanOperand): PlanValue {
    return compared(this.value, operand, (order) => order <= 0);
  }

  year = () => notDriven("year");
  month = () => notDriven("month");
  day = () => notDriven("day");
  dayofyear = () => notDriven("dayofyear");
  dayofweek = () => notDriven("dayofweek");
  mul = () => notDriven("mul");
  div = () => notDriven("div");
  add = () => notDriven("add");
  sub = () => notDriven("sub");
  floor = () => notDriven("floor");
}

function rowOf(stored: TableRow): PlanRow {
  return {
    key: (field) =>
      new Held(Object.hasOwn(stored, field) ? (stored[field] ?? null) : null),
  };
}

/**
 * A table without a database that really filters and measures the rows it holds,
 * for a calculation that needs a right answer rather than a recorded call.
 * Grouping and the period arithmetic are not driven.
 */
export function rowTable(rows: TableRow[]): PlanStream {
  const stream: PlanStream = {
    filter: (predicate) =>
      rowTable(
        rows.filter((stored) => {
          const verdict = predicate(rowOf(stored));
          return verdict instanceof Held && verdict.value === true;
        }),
      ),
    map: () => notDriven("map"),
    group: () => notDriven("group"),
    count: () => ({ run: () => Promise.resolve(rows.length) }),
    sum: (field) => ({
      run: () =>
        Promise.resolve(
          rows.reduce((total, stored) => {
            const cell =
              field !== undefined && Object.hasOwn(stored, field)
                ? stored[field]
                : null;
            return total + (isNumber(cell) ? cell : 0);
          }, 0),
        ),
    }),
    avg: () => notDriven("avg"),
    min: () => notDriven("min"),
    max: () => notDriven("max"),
  };
  return stream;
}
