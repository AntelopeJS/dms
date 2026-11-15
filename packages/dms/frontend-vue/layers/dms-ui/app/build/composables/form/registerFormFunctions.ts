import { cloneFormValue } from "./useFormModel";
import { isStringSet } from "./stringSet";
import {
  isFieldChangePayload,
  readFieldFlagParams,
  readSetFieldValueParams,
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
    const params = readFieldFlagParams(action.params, flagKey);
    if (!params) return;
    const stored = componentState.value[stateKey];
    const current = isStringSet(stored) ? stored : new Set<string>();
    const nextSet = new Set(current);

    if (params.flag) {
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
  const params = readSetFieldValueParams(action.params);
  if (!params) return;
  const write = resolveFieldValueWrite(
    params,
    isFieldChangePayload(eventData.data) ? eventData.data : undefined,
  );
  if (!write) return;

  componentState.value[params.targetField] = cloneFormValue(write.value);
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
