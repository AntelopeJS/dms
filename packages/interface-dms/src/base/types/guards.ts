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

export type GuardFn<TArgs> = (
  this: unknown,
  ctx: RequestContext,
  args: TArgs,
) => void | Promise<void>;

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
