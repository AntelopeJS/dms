import type { Parameters } from "@antelopejs/interface-data-api/components";

type ListFilters = NonNullable<Parameters.ListParameters["filters"]>;

/** What the tokens of a filter value stand for in one request. */
export interface FilterTokenContext {
  userId?: string;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// `{{user.id}}`, `{{now}}`, `{{now-7d}}`, `{{now+14d}}`.
const TOKEN = /\{\{\s*(user\.id|now)(?:\s*([+-])\s*(\d+)d)?\s*\}\}/g;

function resolveToken(
  context: FilterTokenContext,
  name: string,
  sign: string | undefined,
  days: string | undefined,
): string {
  if (name === "user.id") return context.userId ?? "";
  const offset = sign ? Number(`${sign}${days}`) * DAY_MS : 0;
  return new Date(context.now.getTime() + offset).toISOString();
}

/**
 * A filter value with its tokens replaced: `{{user.id}}` by the caller's id,
 * `{{now}}` by the current instant, `{{now±Nd}}` by that instant moved by N
 * days (ISO 8601).
 */
export function resolveFilterValueTokens(
  value: string,
  context: FilterTokenContext,
): string {
  return value.replace(TOKEN, (_match, name: string, sign, days) =>
    resolveToken(context, name, sign, days),
  );
}

/**
 * The list filters with the tokens of their values resolved, so a view
 * written with `{{user.id}}` or `{{now-7d}}` lists — and counts — the rows of
 * the caller, now.
 */
export function resolveFilterTokens(
  filters: Parameters.ListParameters["filters"],
  context: FilterTokenContext,
): Parameters.ListParameters["filters"] {
  if (!filters) return filters;
  const resolved: ListFilters = {};
  for (const [field, [value, mode]] of Object.entries(filters)) {
    resolved[field] = [
      typeof value === "string"
        ? resolveFilterValueTokens(value, context)
        : value,
      mode,
    ];
  }
  return resolved;
}
