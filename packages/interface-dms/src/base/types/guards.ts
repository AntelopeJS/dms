import type { RequestContext } from "@antelopejs/interface-api";

/** Loaded model before response field selection; treat current as read-only. */
export interface GetGuardArgs<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published generic accepts application-owned models; no concrete row schema belongs to the interface package.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  current: T;
}

export interface EditGuardArgs<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published generic accepts application-owned models; no concrete row schema belongs to the interface package.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  /**
   * The fields the edit writes. The guard may amend it in place (stamp a
   * field, drop one): the route writes the body as the guard leaves it, and
   * validates it as it would the request's.
   */
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Confirmation fields are application-defined; narrowing this published payload would reject existing guards.
  values?: Record<string, unknown>;
}

/** What an archive or restore guard receives; see {@link DeleteGuardArgs}. */
export interface BulkGuardArgs {
  ids: string[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Confirmation fields are application-defined; narrowing this published payload would reject existing guards.
  values?: Record<string, unknown>;
}

export interface NewGuardArgs<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published generic accepts application-owned models; no concrete row schema belongs to the interface package.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * The row the request creates. The guard may amend it in place (fill a
   * generated number, a default): the route writes the body as the guard
   * leaves it, and validates it as it would the request's.
   */
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published generic accepts application-owned models; no concrete row schema belongs to the interface package.
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
