import { applyArchiveModeDefaultRules } from "@antelopejs/interface-dms/base/helpers/archive-mode-helpers";
import type { TableViewRowActionOptions } from "@antelopejs/interface-dms/base/table-view";
import { serializeRowActions } from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";
import type { JsonObject, MockupIssue } from "./model";
import { jsonObjectSchema } from "./model";

/**
 * The row field a mockup table in archive mode reads a row's archived state
 * from: the member `@ArchiveField` decorates in the DMS docs and playground.
 */
const ARCHIVE_FIELD = "isArchived";

/** The message of archive or restore turned on in a table without `archiveMode`. */
const ARCHIVE_MODE_MESSAGE =
  'archive and restore need archiveMode: set "archiveMode": true';

/** The row actions a mockup table draws. */
export type DrawnActions = Pick<
  TableViewRowActionOptions,
  "add" | "edit" | "details" | "archive" | "restore"
>;

const ARCHIVE_ACTIONS = ["archive", "restore"] as const;

function isOn(action: DrawnActions[keyof DrawnActions]): boolean {
  if (action === undefined || action === false) return false;
  return action === true || action.isEnabled !== false;
}

/**
 * Archive and restore turned on in a table without `archiveMode`, each at its
 * pointer under `rowActions`: the real `TableView` offers them only in archive
 * mode.
 */
export function archiveActionIssues(
  actions: DrawnActions | undefined,
  pointer: string,
): MockupIssue[] {
  return ARCHIVE_ACTIONS.filter((key) => isOn(actions?.[key])).map((key) => ({
    path: `${pointer}/rowActions/${key}`,
    message: ARCHIVE_MODE_MESSAGE,
  }));
}

/**
 * The row actions of a table in archive mode, ruled as the real `TableView`
 * rules them with `applyArchiveModeDefaultRules`: archive and restore on unless
 * written off, archive and edit on the rows not archived, restore on the
 * archived ones. Duplicate and delete, which a mockup does not draw, stay off.
 */
export function ruleArchiveMode(actions: DrawnActions): DrawnActions {
  const ruled = applyArchiveModeDefaultRules(
    {
      ...actions,
      edit: actions.edit ?? false,
      duplicate: false,
      delete: false,
    },
    ARCHIVE_FIELD,
  );
  return {
    add: ruled?.add,
    edit: ruled?.edit,
    details: ruled?.details,
    archive: ruled?.archive,
    restore: ruled?.restore,
  };
}

/**
 * What a table in archive mode serves beside its forms: archive, restore and
 * the "Show archived" toggle, which the real `TableView` serves its holder of
 * the `viewArchived` permission, as a mockup's viewer is.
 */
export function archiveModeRowActions(ruled: DrawnActions): JsonObject {
  const { archive, restore } = serializeRowActions(ruled);
  return jsonObjectSchema.parse(
    JSON.parse(JSON.stringify({ archive, restore, showArchived: true })),
  );
}

/** How many of `count` rows a fixture without an archive field gives as archived: a quarter, at least one, never all. */
function archivedCount(count: number): number {
  return Math.min(Math.ceil(count / 4), count - 1);
}

/**
 * The rows with their archived state at {@link ARCHIVE_FIELD}: as written when
 * a row writes it, else made up, the last quarter of the rows archived, so a
 * table in archive mode has rows on both sides of its toggle.
 */
function withArchiveField(rows: JsonObject[]): JsonObject[] {
  if (rows.some((row) => Object.hasOwn(row, ARCHIVE_FIELD))) return rows;
  const firstArchived = rows.length - archivedCount(rows.length);
  return rows.map((row, index) => ({
    ...row,
    [ARCHIVE_FIELD]: index >= firstArchived,
  }));
}

/** The rows on one side of the archive toggle: the archived ones, or the others. */
export function archiveSide(
  rows: JsonObject[],
  archived: boolean,
): JsonObject[] {
  return withArchiveField(rows).filter(
    (row) => (row[ARCHIVE_FIELD] === true) === archived,
  );
}
