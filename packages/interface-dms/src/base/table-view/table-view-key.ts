// The `?tableView=` key a write carries, so the routes apply the permission
// and row rules of the table it comes from rather than those of another table
// over the same controller.
//
// Split out of factory-helpers.ts.

import type { ComponentInfoSerialized } from "../../component";
import type { FormPropsSerialized } from "../form-types";
import { TABLE_VIEW_QUERY_KEY } from "./options";

const TABLE_VIEW_PARAM = new RegExp(`([?&])${TABLE_VIEW_QUERY_KEY}=[^&#]*`);

/**
 * `url` naming the table view a write comes from (`?tableView=`). Replaces a
 * key already there. Plain string work: the URL may hold `{{…}}` tokens the
 * frontend fills in.
 */
export function appendTableViewKey(url: string, tableViewKey: string): string {
  const param = `${TABLE_VIEW_QUERY_KEY}=${encodeURIComponent(tableViewKey)}`;
  if (TABLE_VIEW_PARAM.test(url)) {
    return url.replace(TABLE_VIEW_PARAM, `$1${param}`);
  }
  return `${url}${url.includes("?") ? "&" : "?"}${param}`;
}

/** A serialized form whose submit URL names the table view it belongs to. */
export function withTableViewKeyOnSubmit(
  form: ComponentInfoSerialized<FormPropsSerialized> | undefined,
  tableViewKey: string,
): ComponentInfoSerialized<FormPropsSerialized> | undefined {
  const options = form?.options;
  if (!form || !options?.submitUrl) return form;
  return {
    ...form,
    options: {
      ...options,
      submitUrl: appendTableViewKey(options.submitUrl, tableViewKey),
    },
  };
}
