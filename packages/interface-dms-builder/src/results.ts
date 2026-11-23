import type { BlockPath } from "./addressing";

/** A single file mutation staged by an operation. */
export interface FileChange {
  path: string;
  kind: "create" | "modify" | "delete";
  /**
   * The change as unified diff hunks (`@@ -a,b +c,d @@`, then lines prefixed with a space, `-`
   * or `+`), with no file headers; empty for a deleted file or folder.
   */
  diff: string;
}

/** A config validation failure, addressed by a JSON pointer. */
export type ValidationIssue = {
  pointer: string;
  message: string;
};

/** A TypeScript diagnostic from the in-memory typecheck gate. */
export type TypecheckError = {
  file: string;
  line: number;
  message: string;
};

/** A query on the page was taken over by hand, so the draft left it alone. */
type QueryOpaqueCode = "query_opaque";

/** A query the draft dropped is still read by a block, so it was kept. */
type QueryKeptCode = "query_kept";

/** A page moved category, so its route changed and old links break. */
type RouteChangedCode = "route_changed";

/** A mapped resource was deleted; its rows belong to the external database and were kept. */
type DataKeptCode = "data_kept";

/** A mapped relation's tables were written, but its TableView page could not be. */
type PageNotWrittenCode = "page_not_written";

/** A relation the module maps is no longer in the database, or the role can no longer see it. */
type RelationMissingCode = "relation_missing";

/** An SVG logo had scripts, event handlers or external references removed. */
type SvgSanitizedCode = "svg_sanitized";

/**
 * A relation was mapped without the `display` of its text columns, and neither a profile nor
 * an analysis was there to propose a badge from, so those columns were written plain.
 */
type DisplayNotProposedCode = "display_not_proposed";

/**
 * The mapping was written, but the module it was written into did not load again afterwards:
 * it was unloaded and did not start within the wait, or the runtime does not report it active.
 * The message names the module; the backend log holds the error.
 */
type ModuleNotLoadedCode = "module_not_loaded";

/** A setting the page held no longer holds, because another change removed what it needed. */
type SettingDroppedCode = "setting_dropped";

/** A relation of a batch was left out because one of its choices was refused; the others were written. */
type RelationSkippedCode = "relation_skipped";

/** A relation asked writable was mapped read-only, because the database account may not insert, update or delete its rows. */
type RelationReadOnlyCode = "relation_read_only";

/** A column display was not written because it does not suit the column; the column is written plain. */
type DisplayDroppedCode = "display_dropped";

/** A column was marked filterable or sortable because a view, footer figure, tab or grouping needs it. */
type FieldFlagSetCode = "field_flag_set";

/** A relation's label was changed to one the generated code can read, or dropped when no column offers it. */
type LabelChangedCode = "label_changed";

/** A non-fatal advisory attached to an otherwise successful operation. */
export interface OpWarning {
  code:
    | QueryOpaqueCode
    | QueryKeptCode
    | "index_clamped"
    | "datatype_fallback"
    | "data_not_dropped"
    | RouteChangedCode
    | DataKeptCode
    | PageNotWrittenCode
    | RelationMissingCode
    | SvgSanitizedCode
    | DisplayNotProposedCode
    | ModuleNotLoadedCode
    | SettingDroppedCode
    | RelationSkippedCode
    | RelationReadOnlyCode
    | DisplayDroppedCode
    | FieldFlagSetCode
    | LabelChangedCode;
  message: string;
}

/** The scope a duplicate name collides within. */
export type DuplicateScope =
  | "page"
  | "siblings"
  | "category"
  | "resource"
  | "query"
  | "module";

/** Every way an operation can fail. */
export type BuilderError =
  | { code: "not_found"; ref: string }
  | { code: "duplicate_name"; name: string; scope: DuplicateScope }
  | { code: "invalid_config"; issues: ValidationIssue[] }
  | { code: "opaque_target"; path: BlockPath }
  | { code: "unsupported"; detail: string }
  | { code: "referential_integrity"; blockedBy: string[] }
  | { code: "stale"; ref: string; currentVersion: string }
  | { code: "typecheck_failed"; diagnostics: TypecheckError[] };

/** The result of a builder operation. On success, carries the staged changes. */
export type OpResult<T = void> =
  | { ok: true; data: T; changes: FileChange[]; warnings?: OpWarning[] }
  | { ok: false; error: BuilderError };

/** Optional trailing options for version-checked mutations; category mutations do not accept them. */
export interface MutationOpts {
  /** The page or resource structure's `version` last read → `stale` on mismatch. */
  expectedVersion?: string;
}
