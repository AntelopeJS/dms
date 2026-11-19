/** How a mapped column is presented: the cell display and `@Column` options a field sends or keeps. */

import type {
  CellDisplay,
  ColumnDisplay,
  ColumnPresentation,
  MappedField,
} from "@antelopejs/interface-dms-builder";
import {
  patchedPresentation,
  presentationOf,
  presentationRefusal,
} from "./column-presentation";
import type { DisplayDefaults } from "./display-defaults";
import { refuse } from "./mapping-refusal";

/** A field of the call with its cell display set apart: its `display` is a badge or a price. */
export type PlannedField = Omit<MappedField, "display"> & {
  display?: ColumnDisplay | null;
};

/** A field and the cell display it sent, apart: a cell display writes the column without a badge or a price. */
export function splitDisplay(field: MappedField): {
  field: PlannedField;
  cell?: CellDisplay;
} {
  const { display } = field;
  return display && !("kind" in display)
    ? { field: { ...field, display: null }, cell: display }
    : { field: { ...field, display } };
}

/**
 * How the controller presents a field: each option the field sends, else the one the controller
 * held when its relation was mapped before. A field that sends a `display`, or null, replaces the
 * cell display it held.
 */
export function fieldPresentation(
  defaults: DisplayDefaults | undefined,
  where: string,
  sent: MappedField,
  cell: CellDisplay | undefined,
): ColumnPresentation {
  const kept =
    defaults?.kind === "mapped"
      ? (defaults.presentations.get(sent.column) ?? {})
      : {};
  const sentOptions = presentationOf({
    description: sent.description,
    group: sent.group,
    isVisible: sent.isVisible,
    size: sent.size,
    cellWrap: sent.cellWrap,
  });
  const presentation: ColumnPresentation = { ...kept, ...sentOptions };
  const display = sent.display === undefined ? kept.display : cell;
  const written = patchedPresentation(
    { display: display ?? null },
    presentation,
  );
  const refusal = presentationRefusal(written);
  if (refusal) {
    refuse(`${where}: ${refusal}`);
  }
  return written;
}
