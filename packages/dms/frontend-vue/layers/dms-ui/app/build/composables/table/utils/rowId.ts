import { get } from "@nuxt/ui/runtime/utils/index.js";
import { isString } from "#dms-core/app/utils/type-check";
import type { Data } from "../../../components/table/TableRoot.vue";

/** The id a row carries under `idKey`, as the string every row action takes. */
export const rowIdOf = (row: Data, idKey: string): string => {
  const id: unknown = get(row, idKey);
  return isString(id) ? id : String(id);
};

/** The id a row carries under `idKey` as a string, or `undefined` when it carries none. */
export const rowKeyOf = (row: Data, idKey: string): string | undefined => {
  const id: unknown = get(row, idKey);
  return id === undefined || id === null ? undefined : rowIdOf(row, idKey);
};
