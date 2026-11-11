import type { ColumnDescription } from "@antelopejs/interface-database-catalog";
import type { MappedField } from "@antelopejs/interface-dms-builder";
import { relationColumnTitle } from "./analysis-names";
import type { DisplayDefaults } from "./display-defaults";
import type { BatchTarget } from "./map-resources-plan";
import { humanized } from "./name-words";

/** The title a relation's page carries, which a column pointing at it is labelled with in singular. */
function titleOfTarget(target: BatchTarget): string {
  return target.resource.title ?? humanized(target.description.name);
}

/**
 * The label of a column: the one sent. Left out, a plain column takes its name, humanized, and a
 * relation column the one its controller holds when the relation was mapped before, else the
 * target's title in singular (D3), unless the database commented the column (L2).
 */
export function columnLabel(
  defaults: DisplayDefaults | undefined,
  field: MappedField,
  column: ColumnDescription,
  target: BatchTarget | undefined,
): string {
  if (field.label !== undefined) {
    return field.label;
  }
  if (!target) {
    return humanized(field.column);
  }
  const current =
    defaults?.kind === "mapped" ? defaults.labels.get(field.column) : undefined;
  return (
    current ??
    relationColumnTitle(column.comment, column.name, titleOfTarget(target))
      .value
  );
}
