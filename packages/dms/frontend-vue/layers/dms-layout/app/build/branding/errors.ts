import type { ThemeRefusal } from "./theme-types";

/** The builder's own words for a refusal, shown under the banner title. */
export function errorDetail(error: ThemeRefusal): string {
  switch (error.code) {
    case "unsupported":
    case "request_failed":
      return error.detail;
    case "invalid_config":
      return error.issues
        .map((issue) => `${issue.pointer}: ${issue.message}`)
        .join("\n");
    case "typecheck_failed":
      return error.diagnostics
        .map((entry) => `${entry.file}:${entry.line} ${entry.message}`)
        .join("\n");
    case "not_found":
    case "stale":
      return `${error.code}: ${error.ref}`;
    default:
      return error.code;
  }
}
