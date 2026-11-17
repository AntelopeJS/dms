/** @internal @packageDocumentation */
import type { RequestContext } from "@antelopejs/interface-api";
import { AsyncProxy } from "@antelopejs/interface-core";
import type { DataControllerInstance } from "@antelopejs/interface-data-api";
import type { User } from "../../../auth/db";
import type { ColumnValues } from "./data-functions";

type DistinctWithSearch = (
  thisObj: DataControllerInstance,
  ctx: RequestContext,
  columns: string[],
  user?: User,
  permissions?: Set<string>,
) => Promise<ColumnValues[] | undefined>;

/**
 * The distinct values of each column over every row a list request reads,
 * its filters and archive view included: at most `MAX_COLUMN_VALUES + 1`
 * read per column. A column the controller does not list answers nothing.
 *
 * Its own subpath, apart from the `base/table-view` binding, so a runtime
 * that predates it still binds that one. Until a runtime implements it, it
 * answers `undefined`: no values are read.
 *
 * @internal
 */
export const distinctWithSearch = new AsyncProxy<DistinctWithSearch>();

distinctWithSearch.onCall(() => Promise.resolve(undefined), true);
