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

export interface ValidationRouteContext {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Custom validators own the interpretation of these unparsed values; a router-only value type would narrow the published validation context.
  query: Record<string, unknown>;
  params: ValidationRouteContext["query"];
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
