import { PALETTE_SHADES, paletteShade } from "./catalog";
import type { ThemeDraft, ThemeMode } from "./theme-types";

/**
 * The custom properties the DMS's own stylesheets declare, raw (`var(...)`
 * kept): `light` from its `:root` rules, `dark` from its `.dark` rules only.
 */
export interface DmsTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** The project's theme stylesheet, which the preview replaces with the draft. */
const THEME_STYLESHEET = "/app/assets/css/theme.css";

/**
 * The parts of a CSSOM rule the reader looks at. A style rule has a
 * `selectorText`; the declarations a browser splits off a nested rule
 * (`CSSNestedDeclarations`) have a `style` and no selector; `@media`,
 * `@supports` and `@layer` blocks have `cssRules`.
 */
interface ReadableRule {
  cssText: string;
  selectorText?: string;
  style?: CSSStyleDeclaration;
  cssRules?: ArrayLike<ReadableRule>;
  media?: { mediaText: string };
  conditionText?: string;
}

/** A stylesheet as the reader sees it: where it comes from, and its rules. */
export interface ReadableSheet {
  href: string | null;
  ownerNode: Element | ProcessingInstruction | null;
  cssRules: ArrayLike<ReadableRule>;
}

function sheetSource(sheet: ReadableSheet): string {
  const owner = sheet.ownerNode;
  const devId =
    owner instanceof Element ? owner.getAttribute("data-vite-dev-id") : null;
  return `${sheet.href ?? ""} ${devId ?? ""}`;
}

/** `.dark` for dark; `:root` alone or in a list (`.light, :host, :root`) for light. */
function modeOf(selectorText: string): keyof DmsTokens | undefined {
  const selectors = selectorText.split(",").map((part) => part.trim());
  if (selectors.includes(".dark")) return "dark";
  return selectors.includes(":root") ? "light" : undefined;
}

/** Whether a block's `@media` or `@supports` condition holds in this browser. */
function holds(rule: ReadableRule): boolean {
  if (rule.media) {
    return (
      typeof matchMedia !== "function" ||
      matchMedia(rule.media.mediaText).matches
    );
  }
  if (rule.conditionText !== undefined) {
    return typeof CSS === "undefined" || CSS.supports(rule.conditionText);
  }
  return true;
}

function readDeclarations(
  style: CSSStyleDeclaration,
  into: Record<string, string>,
): void {
  for (const name of Array.from(style)) {
    if (name.startsWith("--")) {
      into[name] = style.getPropertyValue(name).trim();
    }
  }
}

/**
 * The custom properties of a `:root` or `.dark` rule, in source order: its own
 * declarations, those the browser split off behind a nested `@supports` (as
 * Tailwind writes its `color-mix` fallbacks), and the nested blocks whose
 * condition holds. A nested rule with a selector of its own is not the root.
 */
function readRootRule(rule: ReadableRule, into: Record<string, string>): void {
  if (rule.style) readDeclarations(rule.style, into);
  for (const child of Array.from(rule.cssRules ?? [])) {
    if (child.selectorText !== undefined) continue;
    if (child.cssRules) {
      if (holds(child)) {
        readRootRule(
          { cssText: child.cssText, cssRules: child.cssRules },
          into,
        );
      }
    } else if (child.style) {
      readDeclarations(child.style, into);
    }
  }
}

function readRules(rules: ArrayLike<ReadableRule>, tokens: DmsTokens): void {
  for (const rule of Array.from(rules)) {
    const mode =
      rule.selectorText === undefined ? undefined : modeOf(rule.selectorText);
    if (mode) {
      readRootRule(rule, tokens[mode]);
    } else if (
      rule.selectorText === undefined &&
      rule.cssRules &&
      holds(rule)
    ) {
      readRules(rule.cssRules, tokens);
    }
  }
}

/**
 * The DMS's tokens, read from the CSSOM: every rule whose selector list holds
 * `:root` (light) or `.dark` (dark), inside the `@layer`, `@media` and
 * `@supports` blocks that apply, skipping the project's theme stylesheet. A
 * later rule wins, as in the cascade.
 */
export function readDmsTokens(sheets: Iterable<ReadableSheet>): DmsTokens {
  const tokens: DmsTokens = { light: {}, dark: {} };
  for (const sheet of sheets) {
    if (sheetSource(sheet).includes(THEME_STYLESHEET)) continue;
    try {
      readRules(sheet.cssRules, tokens);
    } catch {
      continue;
    }
  }
  return tokens;
}

export interface PreviewStyleInput {
  tokens: DmsTokens;
  draft: ThemeDraft;
  mode: ThemeMode;
  /** The palette each role takes without a theme: `branding.defaults.colors`. */
  dmsColors: Partial<Record<string, string>>;
}

function paletteVariables(
  draft: ThemeDraft,
  dmsColors: PreviewStyleInput["dmsColors"],
): Record<string, string> {
  const roles = new Set([
    ...Object.keys(dmsColors),
    ...Object.keys(draft.colors),
  ]);
  const draftColors: Partial<Record<string, string>> = draft.colors;
  const variables: Record<string, string> = {};
  for (const role of roles) {
    const palette = draftColors[role] ?? dmsColors[role];
    if (!palette) continue;
    for (const shade of PALETTE_SHADES) {
      variables[`--ui-color-${role}-${shade}`] = paletteShade(palette, shade);
    }
  }
  return variables;
}

/**
 * The inline style of the preview's root, for one mode: the DMS tokens (and
 * for dark its `.dark` ones on top), each role's palette shades, then the
 * draft's shared and mode values. Inline beats every stylesheet rule, so the
 * saved theme and the page's own mode cannot leak in.
 */
export function previewStyle(input: PreviewStyleInput): Record<string, string> {
  const { tokens, draft, mode } = input;
  return {
    ...tokens.light,
    ...(mode === "dark" ? tokens.dark : {}),
    ...paletteVariables(draft, input.dmsColors),
    ...draft.variables.shared,
    ...draft.variables[mode],
  };
}
