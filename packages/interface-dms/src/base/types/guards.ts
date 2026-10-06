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

export interface DeleteGuardArgs {
  ids: string[];
}

export interface BulkGuardArgs {
  ids: string[];
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
 * ignored.
 */
export type GuardFn<TArgs> = (
  this: unknown,
  ctx: RequestContext,
  args: TArgs,
) => void | AfterWrite | Promise<void | AfterWrite>;

export interface TableViewGuards<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Runs after view authorization and loading, before response and presence acquisition. Not used by exports. */
  get?: GuardFn<GetGuardArgs<T>>;
  edit?: GuardFn<EditGuardArgs<T>>;
  delete?: GuardFn<DeleteGuardArgs>;
  archive?: GuardFn<BulkGuardArgs>;
  restore?: GuardFn<BulkGuardArgs>;
  new?: GuardFn<NewGuardArgs<T>>;
}
