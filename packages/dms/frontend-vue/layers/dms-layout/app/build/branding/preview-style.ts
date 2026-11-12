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

const ROOT_SELECTORS: Record<string, keyof DmsTokens> = {
  ":root": "light",
  ".dark": "dark",
};

function sheetSource(sheet: CSSStyleSheet): string {
  const owner = sheet.ownerNode;
  const devId =
    owner instanceof Element ? owner.getAttribute("data-vite-dev-id") : null;
  return `${sheet.href ?? ""} ${devId ?? ""}`;
}

function readRules(rules: CSSRuleList, tokens: DmsTokens): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText.trim();
      const target = Object.hasOwn(ROOT_SELECTORS, selector)
        ? ROOT_SELECTORS[selector]
        : undefined;
      if (target) {
        for (const name of Array.from(rule.style)) {
          if (name.startsWith("--")) {
            tokens[target][name] = rule.style.getPropertyValue(name).trim();
          }
        }
      }
    }
    if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
      readRules(rule.cssRules, tokens);
    }
  }
}

/**
 * The DMS's tokens, read from the CSSOM: every rule whose selector is exactly
 * `:root` or `.dark`, inside `@layer` and `@media` blocks too, skipping the
 * project's theme stylesheet. A later rule wins, as in the cascade.
 */
export function readDmsTokens(sheets: Iterable<CSSStyleSheet>): DmsTokens {
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
