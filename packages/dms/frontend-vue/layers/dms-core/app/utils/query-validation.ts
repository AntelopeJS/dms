export function validateRequiredQueryParams(
  requiredParams: string[] | undefined,
  queryParams: Record<string, unknown>,
): boolean {
  if (!requiredParams || requiredParams.length === 0) {
    return true;
  }

  return requiredParams.every((param) => {
    const value = queryParams[param];
    return value !== undefined && value !== null && value !== "";
  });
}

export interface ValidationRouteContext {
  query: Record<string, unknown>;
  params: Record<string, unknown>;
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
