/** @internal @packageDocumentation */
import type { Tone } from "../../tones";

/**
 * One value of a column drawn as a status pill: the value the rows hold, its
 * label and the tone it is drawn in.
 *
 * @internal
 */
export interface ColumnBadge {
  value: string;
  label: string;
  tone: Tone;
}

/**
 * A tab above a table over one value of a badge column, or the "all" tab
 * before them.
 *
 * @internal
 */
export interface ColumnBadgeTab {
  id: string;
  label: string;
  filter?: { accessorKey: string; value: string; mode: string };
  textColor?: Tone;
}

/** The value words a status is toned by; a word in none of these takes the next tone of the cycle. */
const TONE_WORDS: readonly (readonly [Tone, readonly string[]])[] = [
  [
    "success",
    ["paid", "active", "done", "completed", "shipped", "delivered", "approved"],
  ],
  ["warning", ["pending", "draft", "processing", "waiting", "review"]],
  [
    "error",
    [
      "failed",
      "cancelled",
      "canceled",
      "refunded",
      "rejected",
      "error",
      "blocked",
    ],
  ],
  ["info", ["new", "open"]],
];

const TONE_OF_WORD = new Map<string, Tone>(
  TONE_WORDS.flatMap(([tone, list]) =>
    list.map((word): [string, Tone] => [word, tone]),
  ),
);

/** The tones the values no word tones take in turn, in the order the values are given. */
const TONE_CYCLE: readonly Tone[] = ["primary", "secondary", "info", "neutral"];

/** A code such as a country or currency code (`NL`, `EUR`), which reads as written, not humanized. */
const CODE_VALUE = /^[A-Z][A-Z0-9_-]*$/;

const ALL_TAB_ID = "all";
const IS_MODE = "is";

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

function humanized(value: string): string {
  const spaced = words(value).join(" ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function badgeLabel(value: string): string {
  return CODE_VALUE.test(value) ? value : humanized(value) || value;
}

/**
 * The badges of a column's values, in the order given: a value named like a
 * state (`paid`, `pending`, `failed`, `new`) takes that state's tone, the
 * others the next tone of the cycle.
 *
 * @internal
 */
export function badgeItems(values: readonly string[]): ColumnBadge[] {
  let cycled = 0;
  return values.map((value) => {
    const known = TONE_OF_WORD.get(value.trim().toLowerCase());
    const tone = known ?? TONE_CYCLE[cycled++ % TONE_CYCLE.length];
    return { value, label: badgeLabel(value), tone };
  });
}

function tabId(column: string, value: string): string {
  return [...words(column), ...words(value)].join("-");
}

/**
 * "All", then a tab per badge of `column` in its order, filtering the rows
 * that hold its value and drawn in its tone.
 *
 * @internal
 */
export function badgeTabs(
  column: string,
  badges: readonly ColumnBadge[],
): ColumnBadgeTab[] {
  const taken = new Set<string>([ALL_TAB_ID]);
  const tabs = badges.map((badge, index) => {
    const id = tabId(column, badge.value);
    const unique = taken.has(id) ? `${id}-${index}` : id;
    taken.add(unique);
    return {
      id: unique,
      label: badge.label,
      filter: { accessorKey: column, value: badge.value, mode: IS_MODE },
      textColor: badge.tone,
    };
  });
  return [{ id: ALL_TAB_ID, label: "All" }, ...tabs];
}
