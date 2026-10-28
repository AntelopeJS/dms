import type {
  AddFrontendModuleOptions,
  FrontendPublicEndpoint,
} from "@antelopejs/interface-dms/page";

const PUBLIC_PATH =
  /^\/api\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/(?:\*|[A-Za-z0-9][A-Za-z0-9._~-]*))*$/;
const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
const DEFAULT_METHODS = ["POST"];
const HEADER_NAME = /^x-[a-z0-9-]+$/;

const RESERVED_HEADER =
  /^x-(?:forwarded-|real-ip$|dms-|inertia|http-method|method-override|original-|rewrite-)/;

function isValidMethods(methods: FrontendPublicEndpoint["methods"]): boolean {
  return (
    Array.isArray(methods) &&
    methods.length > 0 &&
    methods.every(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Registration can originate in JavaScript modules; existing validation rejects nonstring method elements before Set lookup.
      (method) => typeof method === "string" && ALLOWED_METHODS.has(method),
    )
  );
}

function isValidHeaders(headers: FrontendPublicEndpoint["headers"]): boolean {
  return (
    Array.isArray(headers) &&
    headers.every(
      (name) =>
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Untyped module registrations can supply nonstring headers; the existing validator rejects them before regex matching.
        typeof name === "string" &&
        HEADER_NAME.test(name) &&
        !RESERVED_HEADER.test(name),
    )
  );
}

function isValidPublicEndpoint(endpoint: FrontendPublicEndpoint): boolean {
  return (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The registration boundary accepts JavaScript callers; retain rejection of primitive endpoint declarations.
    typeof endpoint === "object" &&
    endpoint !== null &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The existing registration check rejects nonstring paths instead of regex-coercing them.
    typeof endpoint.path === "string" &&
    PUBLIC_PATH.test(endpoint.path) &&
    (endpoint.methods === undefined || isValidMethods(endpoint.methods)) &&
    (endpoint.headers === undefined || isValidHeaders(endpoint.headers))
  );
}

function normalize(endpoint: FrontendPublicEndpoint): FrontendPublicEndpoint {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Malformed primitive declarations must reach the existing registration error unchanged.
  if (typeof endpoint !== "object" || endpoint === null) return endpoint;
  return {
    path: endpoint.path,
    methods: endpoint.methods?.map((method) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string methods are case-normalized; malformed values stay unchanged for the validator's existing rejection.
      typeof method === "string" ? method.toUpperCase() : method,
    ),
    headers: endpoint.headers?.map((name) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string headers are case-normalized; malformed values stay unchanged for the validator's existing rejection.
      typeof name === "string" ? name.toLowerCase() : name,
    ),
  };
}

/**
 * The public endpoints a module declares, checked and spelled out (methods
 * defaulted, headers lowercase as Node reads them).
 *
 * Like the session-opening endpoints, a malformed declaration is a
 * registration error: dropping it would let the module start with a webhook
 * the frontend server then refuses.
 *
 * @param config Module registration as the module wrote it
 * @returns The declared endpoints, in declaration order
 */
export function resolvePublicEndpoints(
  config: AddFrontendModuleOptions,
): Required<FrontendPublicEndpoint>[] {
  const declared = config.publicEndpoints ?? [];
  const invalid = declared.filter(
    (endpoint) => !isValidPublicEndpoint(normalize(endpoint)),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Frontend module "${config.name}" declares invalid publicEndpoints: ` +
        `${invalid.map((endpoint) => JSON.stringify(endpoint)).join(", ")}. ` +
        'Each entry is { path: "/api/…" (literal or * segments), methods?: ' +
        '["POST"], headers?: ["x-…"] }, without reserved headers.',
    );
  }
  return declared.map((endpoint) => {
    const normalized = normalize(endpoint);
    return {
      path: normalized.path,
      methods: normalized.methods ?? DEFAULT_METHODS,
      headers: normalized.headers ?? [],
    };
  });
}

/** A copy a caller cannot use to widen the declaration. */
export function copyPublicEndpoints(
  endpoints: Required<FrontendPublicEndpoint>[],
): Required<FrontendPublicEndpoint>[] {
  return endpoints.map((endpoint) => ({
    path: endpoint.path,
    methods: [...endpoint.methods],
    headers: [...endpoint.headers],
  }));
}
