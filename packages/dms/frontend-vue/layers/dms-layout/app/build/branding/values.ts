import { catalogToken, type ThemeValueKind } from "./catalog";
import type { ThemeDraft } from "./theme-types";
import { VARIABLE_SET_NAMES } from "./theme-types";

/**
 * What the module refuses in a value: anything that ends a declaration or a
 * rule, a comment, an escape, markup, `!important`, or a fetched resource.
 */
const UNSAFE_VALUE =
  /[;{}<>\\]|\/\*|\*\/|(?:url|src|image|image-set|cross-fade|element)\(|@import|!\s*important/i;
const QUOTES = new Set(['"', "'"]);
const CLOSER_BY_OPENER = new Map([
  ["(", ")"],
  ["[", "]"],
]);
const CLOSERS = new Set(CLOSER_BY_OPENER.values());

/** Whether every parenthesis, bracket and quote closes, in order, as the module requires. */
function isBalanced(value: string): boolean {
  const expectedClosers: string[] = [];
  let openQuote: string | undefined;
  for (const character of value) {
    const closer = CLOSER_BY_OPENER.get(character);
    if (openQuote !== undefined) {
      openQuote = character === openQuote ? undefined : openQuote;
    } else if (QUOTES.has(character)) {
      openQuote = character;
    } else if (closer !== undefined) {
      expectedClosers.push(closer);
    } else if (CLOSERS.has(character) && expectedClosers.pop() !== character) {
      return false;
    }
  }
  return openQuote === undefined && expectedClosers.length === 0;
}
export const MAX_VALUE_LENGTH = 512;
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/;

/** Why a value cannot be written, as an i18n key under `branding.problem`. */
export type ValueProblem =
  | "too_long"
  | "unsafe"
  | "unbalanced"
  | "not_color"
  | "not_radius"
  | "not_font";

const KIND_PROBLEMS: Record<ThemeValueKind, ValueProblem> = {
  color: "not_color",
  "border-radius": "not_radius",
  "font-family": "not_font",
};

/** Asks the browser's CSS parser; without one, any value passes. */
function isOfKind(value: string, kind: ThemeValueKind): boolean {
  const css = globalThis.CSS;
  return (
    value.trim() === "" ||
    typeof css?.supports !== "function" ||
    css.supports(kind, value)
  );
}

/** The engine's refusals, checked as a value is typed, plus the kind the browser can tell. */
export function valueProblem(
  value: string,
  kind?: ThemeValueKind,
): ValueProblem | undefined {
  const sent = value.trim();
  if (sent.length > MAX_VALUE_LENGTH) return "too_long";
  if (UNSAFE_VALUE.test(sent)) return "unsafe";
  if (!isBalanced(sent)) return "unbalanced";
  return kind && !isOfKind(sent, kind) ? KIND_PROBLEMS[kind] : undefined;
}

export function variableProblem(
  name: string,
  value: string,
): ValueProblem | undefined {
  return valueProblem(value, catalogToken(name)?.kind);
}

export interface DraftIssue {
  pointer: string;
  problem: ValueProblem | "palette";
}

/** Every value and palette name of a draft Save would be refused for. */
export function draftIssues(draft: ThemeDraft): DraftIssue[] {
  const variables = VARIABLE_SET_NAMES.flatMap((set) =>
    Object.entries(draft.variables[set]).flatMap(([name, value]) => {
      const problem = variableProblem(name, value);
      return problem ? [{ pointer: `/variables/${set}/${name}`, problem }] : [];
    }),
  );
  const colors = Object.entries(draft.colors).flatMap(
    ([role, palette]): DraftIssue[] =>
      palette && !PALETTE_NAME.test(palette)
        ? [{ pointer: `/colors/${role}`, problem: "palette" }]
        : [],
  );
  return [...variables, ...colors];
}
