import type { RequestContext } from "../../../packages/interface-dms/node_modules/@antelopejs/interface-api";
import type { User } from "../../../packages/interface-dms/dist/auth/db/tables/users.table.js";

/** What a route or a serializer answers, as far as the probe reads it: JSON-shaped data. */
export type Observation =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Observation[]
  | { readonly [key: string]: Observation };

export declare class Receiver {}

export interface RouteParams {
  readonly id: string;
}

/** One argument of a base route call, where the probe puts a sentinel in a slot that declares a user. */
export type RouteArgument = string | number | RequestContext | RouteParams | User;

export interface Route {
  readonly func: (
    this: Receiver,
    ...args: never[]
  ) => Observation | Promise<Observation>;
}

/** The display sources the probe hands serializeTableViewDisplays, with numeric card widths and an unknown kanban key. */
export interface DisplayInput {
  readonly displays: readonly {
    readonly id: string;
    readonly options?: { readonly marker: number };
  }[];
  readonly card: {
    readonly fields: readonly string[];
    readonly minWidth: number;
    readonly skeletonHeight: number;
  };
  readonly kanban: { readonly groupBy: string };
}

/** The row actions the probe hands serializeRowActions, with a custom action whose target type is unknown. */
export interface RowActionInput {
  readonly add: { readonly confirm: { readonly title: string } };
  readonly edit: boolean;
  readonly delete: {
    readonly rule: { readonly field: string; readonly equals: string };
  };
  readonly custom: readonly {
    readonly id: string;
    readonly label: string;
    readonly target: { readonly type: string; readonly url: string };
  }[];
}

export function callRoute(
  route: Route,
  receiver: Receiver,
  args: readonly RouteArgument[],
): Observation | Promise<Observation>;
export function serializeTableViewDisplays(input: DisplayInput): Observation;
export function serializeRowActions(input: RowActionInput): Observation;
