import tailwindColors from "tailwindcss/colors";
import type { ThemeColorRole, ThemeVariableSetName } from "./theme-types";

/** The CSS property a value is checked against with `CSS.supports`. */
export type ThemeValueKind = "color" | "border-radius" | "font-family";

/**
 * A DMS token the editor lists. A `modes` token takes a light and a dark
 * value; a `shared` one (corners, fonts) is set once for both.
 */
export interface ThemeToken {
  name: string;
  kind: ThemeValueKind;
  scope: "modes" | "shared";
}

export interface ThemeTokenGroup {
  id: "surfaces" | "text" | "borders" | "accent" | "shape";
  tokens: ThemeToken[];
}

const color = (name: string): ThemeToken => ({
  name,
  kind: "color",
  scope: "modes",
});

const shared = (name: string, kind: ThemeValueKind): ThemeToken => ({
  name,
  kind,
  scope: "shared",
});

export const FONT_VARIABLE = "--font-sans";
export const RADIUS_VARIABLE = "--ui-radius";
export const CARD_RADIUS_VARIABLE = "--dms-radius-card";

/** The DMS tokens of `main.css` the developer mode lists, by what they paint. */
export const THEME_TOKEN_GROUPS: ThemeTokenGroup[] = [
  {
    id: "surfaces",
    tokens: [
      "--ui-bg-muted",
      "--ui-bg",
      "--dms-bg-sidebar",
      "--dms-bg-field",
      "--dms-surface-card",
      "--ui-bg-elevated",
      "--ui-bg-accented",
      "--dms-bg-muted",
    ].map(color),
  },
  {
    id: "text",
    tokens: [
      "--ui-text-highlighted",
      "--ui-text",
      "--ui-text-toned",
      "--ui-text-muted",
      "--ui-text-dimmed",
    ].map(color),
  },
  {
    id: "borders",
    tokens: [
      "--ui-border",
      "--ui-border-muted",
      "--ui-border-accented",
      "--dms-border-top",
    ].map(color),
  },
  {
    id: "accent",
    tokens: [
      "--ui-primary",
      "--dms-accent-fill",
      "--dms-accent-fill-hover",
      "--dms-accent-on-fill",
    ].map(color),
  },
  {
    id: "shape",
    tokens: [
      shared(RADIUS_VARIABLE, "border-radius"),
      shared(CARD_RADIUS_VARIABLE, "border-radius"),
      shared(FONT_VARIABLE, "font-family"),
      shared("--font-mono", "font-family"),
    ],
  },
];

const TOKENS_BY_NAME = new Map(
  THEME_TOKEN_GROUPS.flatMap((group) => group.tokens).map((token) => [
    token.name,
    token,
  ]),
);

export function catalogToken(name: string): ThemeToken | undefined {
  return TOKENS_BY_NAME.get(name);
}

/** The i18n key of a token's label: `--ui-bg-muted` → `ui_bg_muted`. */
export function tokenLabelKey(name: string): string {
  return `branding.token.${name.replace(/^--/, "").replaceAll("-", "_")}`;
}

/** The set a token's value is written to in a mode. */
export function tokenSet(
  token: ThemeToken,
  mode: Exclude<ThemeVariableSetName, "shared">,
): ThemeVariableSetName {
  return token.scope === "shared" ? "shared" : mode;
}

/** Variable names of the draft no catalog token covers, sorted. */
export function uncatalogedNames(names: Iterable<string>): string[] {
  return [...new Set(names)].filter((name) => !TOKENS_BY_NAME.has(name)).sort();
}

const VARIABLE_NAME = /^--[A-Za-z0-9_-]+$/;

export function isVariableName(name: string): boolean {
  return VARIABLE_NAME.test(name);
}

/** The simple mode's background rows, each a token with a light and a dark value. */
export const BACKGROUND_TOKENS = [
  { id: "canvas", name: "--ui-bg-muted" },
  { id: "sidebar", name: "--dms-bg-sidebar" },
  { id: "cards", name: "--ui-bg" },
] as const;

export interface CornerPreset {
  id: "sharp" | "soft" | "round" | "pill";
  radius: string;
  cardRadius: string;
}

/** The simple mode's corners; the DMS default is none of them. */
export const CORNER_PRESETS: CornerPreset[] = [
  { id: "sharp", radius: "0rem", cardRadius: "0rem" },
  { id: "soft", radius: "0.2rem", cardRadius: "0.5rem" },
  { id: "round", radius: "0.5rem", cardRadius: "1.25rem" },
  { id: "pill", radius: "1rem", cardRadius: "1.5rem" },
];

export const STATUS_ROLES: readonly ThemeColorRole[] = [
  "success",
  "warning",
  "error",
  "info",
];

/** Gray palettes make a poor accent: listed last. */
const GRAYS = new Set([
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
]);

function isShadeTable(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null;
}

const TAILWIND_PALETTES: Map<string, Record<string, string>> = new Map(
  Object.entries(tailwindColors).flatMap(([name, value]) =>
    isShadeTable(value) ? [[name, value]] : [],
  ),
);

/** The DMS's own palette, then Tailwind's, grays last. */
export const THEME_PALETTES: string[] = [
  "dms",
  ...[...TAILWIND_PALETTES.keys()].sort(
    (left, right) => Number(GRAYS.has(left)) - Number(GRAYS.has(right)),
  ),
];

/** The simple mode's accent swatches, the others behind "more". */
export const ACCENT_SWATCHES = [
  "dms",
  "violet",
  "green",
  "orange",
  "red",
  "neutral",
];

export const PALETTE_SHADES = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

/**
 * A palette's color at one shade: Tailwind's value for its palettes, else the
 * `--color-<palette>-<shade>` the stylesheets declare (`dms`).
 */
export function paletteShade(palette: string, shade: number): string {
  return (
    TAILWIND_PALETTES.get(palette)?.[shade] ??
    `var(--color-${palette}-${shade})`
  );
}
