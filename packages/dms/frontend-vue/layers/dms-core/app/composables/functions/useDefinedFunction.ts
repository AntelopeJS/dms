import type { isFunction } from "../../utils/type-check";

type CallableFunction = typeof isFunction extends (
  value: Parameters<typeof isFunction>[0],
) => value is infer Fn
  ? Fn
  : never;

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
