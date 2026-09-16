type FieldSetStateKey = "disabledFields" | "hiddenFields" | "requiredFields";

function createFieldSetMutator(stateKey: FieldSetStateKey, flagKey: string) {
  return (
    action: WatchAction,
    _eventData: ComponentEventData,
    componentState: Ref<Record<string, unknown>>,
  ) => {
    const params = action.params as Record<string, unknown> & {
      targetField: string;
    };
    const current =
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
}
