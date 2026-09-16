type CallableFunction = (...args: any[]) => unknown;

const registeredFunctions = ref<Map<string, CallableFunction>>(new Map());

export function useDefinedFunctions() {
  const registerFunction = (id: string, fn: CallableFunction) => {
    registeredFunctions.value.set(id, fn);
  };

  const getFunction = (id: string): CallableFunction | undefined => {
    return registeredFunctions.value.get(id);
  };

  const unregisterFunction = (id: string) => {
    registeredFunctions.value.delete(id);
  };

  return {
    registerFunction,
    getFunction,
    unregisterFunction,
  };
}
