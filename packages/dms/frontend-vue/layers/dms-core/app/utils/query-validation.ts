export function validateRequiredQueryParams(
  requiredParams: string[] | undefined,
  queryParams: ValidationRouteContext["query"],
): boolean {
  if (!requiredParams || requiredParams.length === 0) {
    return true;
  }

  return requiredParams.every((param) => {
    const value = queryParams[param];
    return value !== undefined && value !== null && value !== "";
  });
}

/** The route a validation reads: `Value` is what each query entry holds. */
export interface ValidationRouteContext<Value = unknown> {
  query: Record<string, Value>;
  params: Record<string, Value>;
}

export type ValidationFunction = (route: ValidationRouteContext) => boolean;

export function runCustomValidation(
  customFunctionId: string | undefined,
  getFunction: (id: string) => ValidationFunction | undefined,
  route: ValidationRouteContext,
): boolean {
  if (!customFunctionId) {
    return true;
  }

  const fn = getFunction(customFunctionId);
  if (!fn) {
    return true;
  }

  return fn(route) === true;
}
