import type { PreviewSketch } from "./blockPreview";

/**
 * How a sketch is drawn. The frame is the security boundary: an empty
 * `sandbox` (no scripts, opaque origin, no forms, popups or top navigation)
 * and a CSP that loads nothing but inline styles and `data:` images and fonts.
 */
export const SKETCH_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

export type SketchScheme = "light" | "dark";

/** Class the dashboard puts on `<html>` in its dark theme. */
export const DARK_THEME_CLASS = "dark";

/**
 * A `--sketch-*` token a sketch's CSS may use: read from the dashboard's own
 * variable `source` (a sandboxed document inherits none of them), with the
 * dashboard's default value when that variable is unset.
 */
interface SketchToken {
  name: string;
  source: string;
  light: string;
  dark: string;
}

const SANS_STACK =
  '"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif';
const MONO_STACK = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

export const SKETCH_TOKENS: readonly SketchToken[] = [
  {
    name: "canvas",
    source: "--ui-bg-muted",
    light: "#f4f6f7",
    dark: "#07090b",
  },
  {
    name: "surface",
    source: "--dms-surface-card",
    light: "#ffffff",
    dark: "#10151a",
  },
  {
    name: "surface-muted",
    source: "--dms-bg-muted",
    light: "#f7f9fa",
    dark: "#0d1114",
  },
  { name: "border", source: "--ui-border", light: "#e2e7ea", dark: "#262e36" },
  { name: "text", source: "--ui-text", light: "#2a333b", dark: "#c7d0d8" },
  {
    name: "text-strong",
    source: "--ui-text-highlighted",
    light: "#0b1114",
    dark: "#eef3f6",
  },
  {
    name: "text-muted",
    source: "--ui-text-muted",
    light: "#49525b",
    dark: "#9ea7b0",
  },
  { name: "accent", source: "--ui-primary", light: "#167f8a", dark: "#4dd9e6" },
  {
    name: "accent-fill",
    source: "--dms-accent-fill",
    light: "#4dd9e6",
    dark: "#4dd9e6",
  },
  {
    name: "success",
    source: "--ui-success",
    light: "#15803d",
    dark: "#4ade80",
  },
  { name: "error", source: "--ui-error", light: "#b91c1c", dark: "#f87171" },
  {
    name: "radius",
    source: "--dms-radius-card",
    light: "0.875rem",
    dark: "0.875rem",
  },
  { name: "font", source: "--font-sans", light: SANS_STACK, dark: SANS_STACK },
  {
    name: "font-mono",
    source: "--font-mono",
    light: MONO_STACK,
    dark: MONO_STACK,
  },
];

/** A dashboard value that could end the style element it is written into. */
const UNSAFE_TOKEN_VALUE = /[<>{};]/;

/** Neutral base under the sketch's CSS, so a bare sketch already looks native. */
const SKETCH_BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{color-scheme:var(--sketch-scheme);background:var(--sketch-canvas)}
body{margin:0;padding:16px;font:14px/1.5 var(--sketch-font);color:var(--sketch-text);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 .5em;color:var(--sketch-text-strong);line-height:1.25}
p{margin:0 0 .5em}
img,svg{max-width:100%}
code,kbd,pre{font-family:var(--sketch-font-mono)}`;

/** Reads a dashboard variable; unset or unsafe values give the token's default. */
export type TokenReader = (variable: string) => string;

function tokenValue(
  token: SketchToken,
  scheme: SketchScheme,
  read: TokenReader,
): string {
  const value = read(token.source).trim();
  if (value === "" || UNSAFE_TOKEN_VALUE.test(value)) return token[scheme];
  return value;
}

/** The `:root` rule giving a sandboxed sketch the dashboard's theme. */
export function sketchTokensCss(
  scheme: SketchScheme,
  read: TokenReader,
): string {
  const declarations = SKETCH_TOKENS.map(
    (token) => `--sketch-${token.name}:${tokenValue(token, scheme, read)};`,
  );
  return `:root{--sketch-scheme:${scheme};${declarations.join("")}}`;
}

export function computedStyleReader(element: Element): TokenReader {
  const style = getComputedStyle(element);
  return (variable) => style.getPropertyValue(variable);
}

/** The scheme the dashboard shows now: its dark class on `<html>`, or light. */
export function currentSketchScheme(): SketchScheme {
  return document.documentElement.classList.contains(DARK_THEME_CLASS)
    ? "dark"
    : "light";
}

/**
 * The standalone document a sketch is drawn in. The CSP comes first in the
 * head, before anything the sketch wrote, so no later markup can loosen it.
 *
 * It draws `sketch.html` and `sketch.css` as given, checking neither: hand it
 * only the sketch `checkSketch` from `@antelopejs/dms/sketch` answered, as a
 * compiled mockup holds it. The frame's CSP stops loads but not a link out,
 * so unchecked markup can navigate the frame away.
 */
export function buildSketchDocument(
  sketch: PreviewSketch,
  tokensCss: string,
): string {
  return [
    "<!doctype html><html><head>",
    `<meta http-equiv="Content-Security-Policy" content="${SKETCH_CSP}">`,
    '<meta charset="utf-8">',
    `<style>${tokensCss}\n${SKETCH_BASE_CSS}</style>`,
    `<style>${sketch.css ?? ""}</style>`,
    `</head><body>${sketch.html}</body></html>`,
  ].join("");
}
