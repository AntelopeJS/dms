import type { RequestContext } from "@antelopejs/interface-api";

/** Loaded model before response field selection; treat current as read-only. */
export interface GetGuardArgs<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  current: T;
}

export interface EditGuardArgs<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  body: Partial<T>;
  current: T;
}

/**
 * What a delete, archive or restore guard receives: the rows, and the values
 * of the fields its confirmation asked (`confirm.fields`), such as where to
 * move what the rows take with them. `values` is unset when the request
 * carried no body: no confirmation with fields was answered.
 */
export interface DeleteGuardArgs {
  ids: string[];
  values?: Record<string, unknown>;
}

/** What an archive or restore guard receives; see {@link DeleteGuardArgs}. */
export interface BulkGuardArgs {
  ids: string[];
  values?: Record<string, unknown>;
}

export interface NewGuardArgs<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  body: Partial<T>;
}

/**
 * Work a mutating guard hands back, run once the write it guarded succeeded:
 * the guard knows the row as it was, this knows it was written — a
 * notification comparing the two belongs here. It runs in the same request,
 * on the same instance; a failure is logged and never fails the request, the
 * write being done.
 */
export type AfterWrite = () => void | Promise<void>;

/**
 * Throws to refuse the action. A mutating guard (`edit`, `delete`, `archive`,
 * `restore`, `new`) may return an {@link AfterWrite}; what `get` returns is
 * ignored. It runs with the data controller instance as `this`
 * (`TController`), so a guard written as a `function` reaches its models.
 */
export type GuardFn<TArgs, TController = unknown> = (
  this: TController,
  ctx: RequestContext,
  args: TArgs,
) => void | AfterWrite | Promise<void | AfterWrite>;

/**
 * The guards of a table view. `T` is its data controller instance — the type
 * `TableView()` infers from the controller — so it types both the row a
 * guard reads and the `this` it runs with.
 */
export interface TableViewGuards<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Runs after view authorization and loading, before response and presence acquisition. Not used by exports. */
  get?: GuardFn<GetGuardArgs<T>, T>;
  edit?: GuardFn<EditGuardArgs<T>, T>;
  delete?: GuardFn<DeleteGuardArgs, T>;
  archive?: GuardFn<BulkGuardArgs, T>;
  restore?: GuardFn<BulkGuardArgs, T>;
  new?: GuardFn<NewGuardArgs<T>, T>;
}
