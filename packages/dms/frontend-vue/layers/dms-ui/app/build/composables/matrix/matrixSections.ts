import type {
  MatrixGroup,
  MatrixGrouping,
  MatrixRow,
} from "../../../types/matrix";

/** Rows under one group header; `group` null for the rows in none. */
export interface MatrixSection {
  key: string;
  group: MatrixGroup | null;
  rows: MatrixRow[];
}

/** The group a row joins, by its key, with the header it reads. */
export interface MatrixRowGroup {
  key: string;
  label: string;
}

/**
 * The group of a row that names none: the group of its value in
 * `groupByField` (see `useMatrixRows`), or none.
 */
export type MatrixRowGroupOf = (row: MatrixRow) => MatrixRowGroup | null;

const UNGROUPED_KEY = "\u0000ungrouped";
const FIELD_GROUP_PREFIX = "\u0000field:";

/** The section key of a group built from `groupByField`. */
export function fieldGroupKey(key: string): string {
  return `${FIELD_GROUP_PREFIX}${key}`;
}

function sectionOf(
  row: MatrixRow,
  declared: Map<string, MatrixGroup>,
  groupOf: MatrixRowGroupOf | undefined,
): MatrixSection {
  if (row.group !== undefined) {
    const group = declared.get(row.group) ?? {
      id: row.group,
      label: row.group,
    };
    return { key: row.group, group, rows: [] };
  }
  const derived = groupOf?.(row);
  if (!derived) return { key: UNGROUPED_KEY, group: null, rows: [] };
  const key = fieldGroupKey(derived.key);
  return { key, group: { id: key, label: derived.label }, rows: [] };
}

/**
 * The rows under their group headers, as the table view's grouped display
 * cuts them. A row joins the group its `group` names (described by the
 * response's `groups`), else the group of its value in `groupByField`
 * (`groupOf`). The groups the response lists come in its order, then the
 * others as their first row comes; the rows in no group come first, without
 * a header. A page starting inside a group shows that group's header on top.
 */
export function buildMatrixSections(
  rows: MatrixRow[],
  groups: MatrixGroup[] | undefined,
  groupOf?: MatrixRowGroupOf,
): MatrixSection[] {
  const declared = new Map((groups ?? []).map((group) => [group.id, group]));
  const sections = new Map<string, MatrixSection>();
  sections.set(UNGROUPED_KEY, { key: UNGROUPED_KEY, group: null, rows: [] });
  for (const group of groups ?? []) {
    sections.set(group.id, { key: group.id, group, rows: [] });
  }
  for (const row of rows) {
    const candidate = sectionOf(row, declared, groupOf);
    const section = sections.get(candidate.key) ?? candidate;
    sections.set(candidate.key, section);
    section.rows.push(row);
  }
  return [...sections.values()].filter((section) => section.rows.length > 0);
}

/**
 * The groups that start folded: the ones the response says so, or every
 * group once the grid holds more than `collapseAbove` rows. None when
 * `collapsible` is `false`: a folded group could never be opened.
 */
export function initiallyCollapsed(
  sections: MatrixSection[],
  grouping: MatrixGrouping | undefined,
  rowCount: number,
): string[] {
  if (grouping?.collapsible === false) return [];
  const isLarge =
    grouping?.collapseAbove !== undefined && rowCount > grouping.collapseAbove;
  return sections
    .filter((section) => section.group)
    .filter((section) => isLarge || section.group?.collapsed)
    .map((section) => section.key);
}

/** The rows drawn, section after section, without the folded ones. */
export function shownRows(
  sections: MatrixSection[],
  collapsed: ReadonlySet<string> | readonly string[],
): MatrixRow[] {
  const folded = new Set(collapsed);
  return sections.flatMap((section) =>
    section.group && folded.has(section.key) ? [] : section.rows,
  );
}

/**
 * Whether a header click folds its group: `collapsible`, or by default when
 * a group may start folded (`collapseAbove`, a group answered `collapsed`),
 * which must then open.
 */
export function isFoldable(
  grouping: MatrixGrouping | undefined,
  sections: MatrixSection[],
): boolean {
  if (grouping?.collapsible !== undefined) return grouping.collapsible;
  return (
    grouping?.collapseAbove !== undefined ||
    sections.some((section) => section.group?.collapsed)
  );
}
