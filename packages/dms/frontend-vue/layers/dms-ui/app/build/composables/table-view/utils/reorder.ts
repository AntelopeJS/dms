import { get } from "@nuxt/ui/runtime/utils/index.js";

/** A row's new position value, saved by a partial edit. */
export interface ReorderEdit {
  id: string;
  value: number;
}

const POSITION_STEP = 1;

/** The rows with the one at `from` moved to `to`. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

const positionOf = (row: unknown, field: string): number | undefined => {
  const value = Number(get(row as Record<string, unknown>, field));
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The position the moved row takes between its new neighbours, when they
 * leave room for one: halfway between them, or a step beyond the only one.
 */
function slotBetween(
  previous: number | undefined,
  next: number | undefined,
): number | undefined {
  if (previous !== undefined && next !== undefined) {
    return previous < next ? (previous + next) / 2 : undefined;
  }
  if (previous !== undefined) return previous + POSITION_STEP;
  if (next !== undefined) return next - POSITION_STEP;
  return undefined;
}

/**
 * The edits a move saves: the moved row alone when its neighbours leave
 * room for it, else the page renumbered from its lowest position — and only
 * the rows whose position changed.
 */
export function reorderEdits(
  rows: readonly unknown[],
  movedIndex: number,
  field: string,
  rowIdKey: string,
): ReorderEdit[] {
  const idOf = (row: unknown) =>
    String(get(row as Record<string, unknown>, rowIdKey));
  const slot = slotBetween(
    positionOf(rows[movedIndex - 1], field),
    positionOf(rows[movedIndex + 1], field),
  );
  if (slot !== undefined) {
    return [{ id: idOf(rows[movedIndex]), value: slot }];
  }
  const positions = rows
    .map((row) => positionOf(row, field))
    .filter((value): value is number => value !== undefined);
  const base = positions.length > 0 ? Math.min(...positions) : 0;
  return rows.flatMap((row, index) => {
    const value = base + index * POSITION_STEP;
    return positionOf(row, field) === value ? [] : [{ id: idOf(row), value }];
  });
}
