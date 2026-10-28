/** How many results are asked for per suggestion shown, to rank from. */
export const SUGGESTION_POOL_FACTOR = 4;
/** The most results asked for at once. */
export const SUGGESTION_POOL_MAX = 20;

/** A suggestion as the address field lists it. */
export interface RankableSuggestion {
  label: string;
  /** ISO 3166-1 alpha-2 code of the suggestion's country, upper case. */
  countryCode?: string;
}

/** How many results to ask the geocoder for, to show `limit`. */
export function suggestionPoolSize(limit: number): number {
  return Math.min(SUGGESTION_POOL_MAX, limit * SUGGESTION_POOL_FACTOR);
}

/**
 * The suggestions to list: each label once, those in `country` (when given)
 * first and in the geocoder's order otherwise, at most `limit`.
 *
 * @internal
 */
export function rankAddressSuggestions<T extends RankableSuggestion>(
  suggestions: readonly T[],
  country: string | undefined,
  limit: number,
): T[] {
  const seen = new Set<string>();
  const unique = suggestions.filter((suggestion) => {
    const key = suggestion.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const preferred = country?.toUpperCase();
  if (!preferred) return unique.slice(0, limit);
  const isPreferred = (suggestion: T) =>
    suggestion.countryCode?.toUpperCase() === preferred;
  return [
    ...unique.filter(isPreferred),
    ...unique.filter((suggestion) => !isPreferred(suggestion)),
  ].slice(0, limit);
}
