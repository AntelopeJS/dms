import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from "vue";
import { isNumber, isObject, isString } from "#dms-core/app/utils/type-check";
import { FormEvents } from "../../../composables/form/types/events";
import { siblingComponentId } from "../../../utils/componentId";
import type { MatrixFollowedField } from "../../../types/matrix";

/** A form's field change, as the DMS form sends it on `window`. */
interface FieldChange {
  /** The component id of the form. */
  readonly component: unknown;
  readonly fieldId: unknown;
  readonly value: unknown;
}

/** What a field's value is sent as: its figure or its text, empty once the field is emptied. */
export function followedValue(value: FieldChange["value"]): string {
  if (isNumber(value)) return Number.isFinite(value) ? String(value) : "";
  return isString(value) ? value : "";
}

/** The field change an event carries, `undefined` for any other event. */
function fieldChangeOf(event: Event): FieldChange | undefined {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  if (!isObject(detail) || detail === null) return undefined;
  const { component, data } = detail;
  if (!isObject(data) || data === null) return undefined;
  return { component, fieldId: data.fieldId, value: data.value };
}

/**
 * The query parameters a grid reads its rows with for the form field it
 * follows (`followField`): none until the form beside it says a value of the
 * field, then `{ [param]: value }` after each change. The grid reads again
 * when they change, so a column the route computes from the field follows
 * what is typed.
 */
export function useFollowedField(
  followed: MatrixFollowedField | undefined,
  componentId: string,
): Readonly<ShallowRef<Readonly<Record<string, string>>>> {
  const params = shallowRef<Readonly<Record<string, string>>>({});
  if (!followed) return params;
  const source = siblingComponentId(componentId, followed.block);
  const onChange = (event: Event) => {
    const change = fieldChangeOf(event);
    if (change?.component !== source || change.fieldId !== followed.field)
      return;
    const value = followedValue(change.value);
    if (params.value[followed.param] !== value)
      params.value = { [followed.param]: value };
  };
  onMounted(() => window.addEventListener(FormEvents.FIELD_CHANGE, onChange));
  onBeforeUnmount(() =>
    window.removeEventListener(FormEvents.FIELD_CHANGE, onChange),
  );
  return params;
}
