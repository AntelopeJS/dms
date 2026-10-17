import type { ComponentInfoSerialized } from "../../../component";
import { HasPermission } from "../../../permissions";
import type { FormBuilder, FormPropsSerialized } from "../../form-types";
import type { WatchAction } from "../../types/watch";
import type { TableViewFormWatch } from "../options";
import type { TableViewGrants } from "./request-filter";

/**
 * Declare a table view's `formWatches` on one of the forms it opens, as
 * `.watch()` would: the drawer and the modal embed the form with them, and a
 * form page mounts the same builder.
 *
 * @internal
 */
export function applyFormWatches(
  form: FormBuilder | undefined,
  watches: TableViewFormWatch[] = [],
): FormBuilder | undefined {
  for (const { event, functionId, ...watchOptions } of watches) {
    form?.watch(event, functionId, watchOptions);
  }
  return form;
}

type SerializedForm = ComponentInfoSerialized<FormPropsSerialized>;

/**
 * An embedded form with only the watches the caller may run. A page filters
 * the watches of its own components; a form the table view embeds in its
 * options (opened in a drawer or a modal) is not one of them, so its
 * `requirePermission` is checked here.
 */
async function withGrantedFormWatches(
  form: SerializedForm | undefined,
  permissions: Set<string>,
): Promise<SerializedForm | undefined> {
  const watches = (
    form?.options as { watchActions?: WatchAction[] } | undefined
  )?.watchActions;
  if (!form?.options || !watches?.length) return form;
  const granted = await Promise.all(
    watches.map(
      async (watch) =>
        !watch.requirePermission ||
        (await HasPermission(permissions, watch.requirePermission)),
    ),
  );
  return {
    ...form,
    options: {
      ...form.options,
      watchActions: watches.filter((_, index) => granted[index]),
    } as FormPropsSerialized,
  };
}

type FormComponents = Record<
  "new" | "edit" | "view",
  SerializedForm | undefined
>;

/**
 * The forms a table view serves a caller: those whose action it holds, each
 * with only the watches it may run.
 *
 * @internal
 */
export async function grantedFormComponents(
  forms: Partial<FormComponents>,
  grants: TableViewGrants,
  permissions: Set<string>,
): Promise<FormComponents> {
  const served = (form: SerializedForm | undefined, isGranted: boolean) =>
    isGranted ? withGrantedFormWatches(form, permissions) : undefined;
  return {
    new: await served(forms.new, grants.add),
    edit: await served(forms.edit, grants.edit),
    view: await served(forms.view, grants.view),
  };
}
