import type {
  ThemeMode,
  ThemeVariableSets,
  ThemeVariables,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";

export const THEME_MODES: ThemeMode[] = ["light", "dark"];

export type VariableSetName = keyof ThemeVariableSets;

export const VARIABLE_SET_NAMES: VariableSetName[] = ["shared", ...THEME_MODES];

/**
 * The selector each set is written under. The DMS declares its defaults in
 * its `dms` cascade layer, so these unlayered rules beat them whatever the
 * load order. Light is not plain `:root`, which also matches in dark mode and
 * would beat the DMS's layered `.dark`: a light-only value would show in dark
 * too. A mode's rule beats the shared `:root`: light by specificity, `.dark` by
 * coming later in the file (the order of `VARIABLE_SET_NAMES`).
 */
const SET_SELECTORS: Record<VariableSetName, string> = {
  shared: ":root",
  light: ":root:not(.dark)",
  dark: ".dark",
};

const SET_NAME_BY_SELECTOR = new Map(
  VARIABLE_SET_NAMES.map((setName) => [SET_SELECTORS[setName], setName]),
);

const VARIABLE_NAME = /^--[A-Za-z0-9_-]+$/;
const DECLARATION = /^(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/;
const DESCRIPTOR = /^([a-z-]+)\s*:\s*([\s\S]+)$/;
const FONT_FACE = "@font-face";
const RULE = /^\s*([^{}]+?)\s*\{([^{}]*)\}/;

/**
 * What a value may not hold: anything that ends a declaration or a rule, a
 * comment, an escape, markup, a resource fetched from elsewhere, or
 * `!important`. A theme value is a color, a length, a font stack or a shadow,
 * none of which needs any of these.
 */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|url\(|@import|!important/i;
const MAX_VALUE_LENGTH = 512;
const INDENT = "  ";
const QUOTES = new Set(['"', "'"]);
const CLOSER_BY_OPENER = new Map([
  ["(", ")"],
  ["[", "]"],
]);
const CLOSERS = new Set(CLOSER_BY_OPENER.values());

/** An `@font-face` rule's descriptors, in the order they are written. */
export type FontFaceRule = Array<[descriptor: string, value: string]>;

export interface ParsedStylesheet {
  variables?: ThemeVariableSets;
  fontFaces?: FontFaceRule[];
  opaqueReason?: string;
}

export function createEmptyVariableSets(): ThemeVariableSets {
  return { shared: {}, light: {}, dark: {} };
}

/**
 * Every parenthesis, bracket and quote must close, in order: one left open
 * runs past the declaration, so `calc(1rem` would swallow the rest of the
 * stylesheet, light and dark rules included.
 */
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

function invalidValueReason(value: string): string | undefined {
  if (value.trim() === "") {
    return "is empty";
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return `is longer than ${MAX_VALUE_LENGTH} characters`;
  }
  if (UNSAFE_VALUE.test(value)) {
    return "holds a character or a construct a theme value cannot carry";
  }
  return isBalanced(value)
    ? undefined
    : "leaves a parenthesis, a bracket or a quote open";
}

function parseDeclarations(body: string): ThemeVariables | undefined {
  const variables: ThemeVariables = {};
  const declarations = body
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const declaration of declarations) {
    const match = DECLARATION.exec(declaration);
    const value = match?.[2]?.trim();
    if (!match?.[1] || value === undefined || invalidValueReason(value)) {
      return undefined;
    }
    variables[match[1]] = value;
  }
  return variables;
}

function parseDescriptors(body: string): FontFaceRule | undefined {
  const descriptors: FontFaceRule = [];
  const entries = body
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const entry of entries) {
    const match = DESCRIPTOR.exec(entry);
    if (!match?.[1] || match[2] === undefined) {
      return undefined;
    }
    descriptors.push([match[1], match[2].trim()]);
  }
  return descriptors;
}

/**
 * The builder owns this file: rules of custom properties under its three
 * selectors, and the `@font-face` rules of the fonts it hosts, nothing else.
 * Anything more (another selector, a comment, another at-rule) was written by
 * hand and would be lost when the builder rewrites the file, so the file is
 * reported as opaque instead. Two rules under one selector merge, the later
 * one winning. Whether a `@font-face` is one the builder wrote is for the
 * caller to tell.
 */
export function parseStylesheet(text: string): ParsedStylesheet {
  const variables = createEmptyVariableSets();
  const fontFaces: FontFaceRule[] = [];
  let rest = text;
  while (rest.trim() !== "") {
    const rule = RULE.exec(rest);
    const selector = rule?.[1]?.trim() ?? "";
    const setName = SET_NAME_BY_SELECTOR.get(selector);
    if (!rule || (!setName && selector !== FONT_FACE)) {
      return {
        opaqueReason: `it holds rules other than ${[...SET_NAME_BY_SELECTOR.keys(), FONT_FACE].join(", ")}`,
      };
    }
    if (setName) {
      const declarations = parseDeclarations(rule[2] ?? "");
      if (!declarations) {
        return {
          opaqueReason: `its ${selector} rule holds more than custom properties`,
        };
      }
      Object.assign(variables[setName], declarations);
    } else {
      const descriptors = parseDescriptors(rule[2] ?? "");
      if (!descriptors) {
        return {
          opaqueReason: `one of its ${FONT_FACE} rules holds more than descriptors`,
        };
      }
      fontFaces.push(descriptors);
    }
    rest = rest.slice(rule[0].length);
  }
  return { variables, fontFaces };
}

function emitBlock(selector: string, lines: string[]): string {
  return `${selector} {\n${lines.map((line) => `${INDENT}${line}`).join("\n")}\n}`;
}

function emitRule(selector: string, variables: ThemeVariables): string {
  const names = Object.keys(variables).sort();
  if (names.length === 0) {
    return "";
  }
  return emitBlock(
    selector,
    names.map((name) => `${name}: ${variables[name]};`),
  );
}

/**
 * The `@font-face` rules first, as given, then one rule per non-empty set,
 * its declarations sorted by name.
 */
export function emitStylesheet(
  variables: ThemeVariableSets,
  fontFaces: FontFaceRule[] = [],
): string {
  const rules = [
    ...fontFaces.map((descriptors) =>
      emitBlock(
        FONT_FACE,
        descriptors.map(([descriptor, value]) => `${descriptor}: ${value};`),
      ),
    ),
    ...VARIABLE_SET_NAMES.map((setName) =>
      emitRule(SET_SELECTORS[setName], variables[setName] ?? {}),
    ),
  ].filter((rule) => rule !== "");
  return rules.length === 0 ? "" : `${rules.join("\n\n")}\n`;
}

function variableIssues(
  setName: VariableSetName,
  variables: ThemeVariables,
): ValidationIssue[] {
  return Object.entries(variables).flatMap(([name, value]) => {
    const pointer = `/variables/${setName}/${name}`;
    if (!VARIABLE_NAME.test(name)) {
      return [
        { pointer, message: `${name} is not a CSS custom property name` },
      ];
    }
    const invalidReason = invalidValueReason(value);
    return invalidReason
      ? [{ pointer, message: `${name} ${invalidReason}` }]
      : [];
  });
}

/**
 * One issue per variable whose name is not a custom property, or whose value
 * the stylesheet cannot hold.
 */
export function validateVariables(
  variables: ThemeVariableSets,
): ValidationIssue[] {
  return VARIABLE_SET_NAMES.flatMap((setName) =>
    variableIssues(setName, variables[setName] ?? {}),
  );
}
