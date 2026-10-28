import {
  type FieldChangePayload,
  type SetFieldValueParams,
  resolveFieldValueWrite,
} from "./fieldValueRule";
import type { WatchActionFunction } from "#dms-core/app/types/watch";

type FieldSetStateKey = "disabledFields" | "hiddenFields" | "requiredFields";

function createFieldSetMutator(stateKey: FieldSetStateKey, flagKey: string) {
  return (
    action: WatchAction,
    _eventData: ComponentEventData,
    componentState: Parameters<WatchActionFunction>[2],
  ) => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- WatchAction permits absent or arbitrary params; neither inference nor the registration's function type proves targetField, so retain this unchecked action boundary.
    const params = action.params as NonNullable<WatchAction["params"]> & {
      targetField: string;
    };
    const current =
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch actions can replace these open state entries; preserve the existing unchecked iterable conversion and falsy fallback.
      (componentState.value[stateKey] as Set<string>) || new Set();
    const nextSet = new Set(current);

    if (params[flagKey]) {
      nextSet.add(params.targetField);
    } else {
      nextSet.delete(params.targetField);
    }

    componentState.value[stateKey] = nextSet;
  };
}

function setFieldValue(
  action: WatchAction,
  eventData: ComponentEventData,
  componentState: Parameters<WatchActionFunction>[2],
) {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- WatchAction does not correlate the function ID with SetFieldValueParams; deriving the handler type still leaves this unchecked parameter handoff.
  const params = action.params as NonNullable<WatchAction["params"]> &
    SetFieldValueParams;
  const write = resolveFieldValueWrite(
    params,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch actions also receive arbitrary component events; FieldChangePayload's owner does not validate eventData.data, and filtering events would change behavior.
    eventData.data as FieldChangePayload | undefined,
  );
  if (!write) return;

  componentState.value[params.targetField] =
    write.value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(write.value));
}

export function registerFormFunctions() {
  const { registerFunction } = useDefinedFunctions();

  registerFunction(
    FormFunctions.SET_FIELD_DISABLED,
    createFieldSetMutator("disabledFields", "setDisabled"),
  );

  registerFunction(
    FormFunctions.SET_FIELD_HIDDEN,
    createFieldSetMutator("hiddenFields", "setHidden"),
  );

  registerFunction(
    FormFunctions.SET_FIELD_REQUIRED,
    createFieldSetMutator("requiredFields", "setRequired"),
  );

  registerFunction(FormFunctions.SET_FIELD_VALUE, setFieldValue);
}
