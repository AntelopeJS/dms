import { catalogToken, type ThemeValueKind } from "./catalog";
import type { ThemeDraft } from "./theme-types";
import { VARIABLE_SET_NAMES } from "./theme-types";

/**
 * What the module refuses in a value: anything that ends a declaration or a
 * rule, a comment, an escape, markup, `!important`, or a fetched resource.
 */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|url\(|@import|!important/i;
export const MAX_VALUE_LENGTH = 512;
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/;

/** Why a value cannot be written, as an i18n key under `branding.problem`. */
export type ValueProblem =
  | "too_long"
  | "unsafe"
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
  if (value.length > MAX_VALUE_LENGTH) return "too_long";
  if (UNSAFE_VALUE.test(value)) return "unsafe";
  return kind && !isOfKind(value, kind) ? KIND_PROBLEMS[kind] : undefined;
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
