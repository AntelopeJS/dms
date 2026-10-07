const DEFAULT_COLOR_NAME = "primary";
const SAFE_HEX_FALLBACK = "#7c3aed";
const MUTED_FALLBACK = "#6b7280";
const GRID_FALLBACK = "rgba(148, 163, 184, 0.25)";
const SURFACE_FALLBACK = "#ffffff";
const MONO_FONT_FALLBACK = "ui-monospace, monospace";
const MONO_FONT_VARIABLE = "--font-mono";
const HEX_PREFIXES = ["#", "rgb", "hsl"];
const SHADE_TOKEN =
  /^(primary|secondary|success|info|warning|error|neutral|accent)-(50|[1-9]00|950)$/;
const CSS_VARIABLE = /^--[\w-]+$/;
const CSS_VARIABLE_FUNCTION = /^var\((--[\w-]+)\)$/;
const COLOR_CHANNEL_MAX = 255;
const DEFAULT_PALETTE = [
  "--dms-chart-1",
  "--dms-chart-2",
  "--dms-chart-3",
  "--dms-chart-4",
  "--dms-chart-5",
];

const COLOR_NAME_TO_VAR: Record<string, string> = {
  primary: "--ui-primary",
  secondary: "--ui-secondary",
  success: "--ui-success",
  info: "--ui-info",
  warning: "--ui-warning",
  error: "--ui-error",
  neutral: "--ui-text-toned",
  accent: "--ui-primary",
};

function isHexLike(value: string): boolean {
  return HEX_PREFIXES.some((prefix) => value.startsWith(prefix));
}

const colorProbeCache = new Map<string, string>();

/** Invalidate resolved colors before consumers recompute for a theme change. */
export function clearChartColorCache(): void {
  colorProbeCache.clear();
}

function toApexColor(color: string, fallback: string): string {
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)")
    return fallback;
  if (color.startsWith("rgb")) return color;
  // Computed styles preserve OKLCH in modern browsers; Apex expects sRGB.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return fallback;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (!alpha) return fallback;
  // Apex reads the alpha of an rgba() series colour as its fill opacity,
  // overriding fill.opacity and gradient stops, so opaque colours stay rgb().
  if (alpha === COLOR_CHANNEL_MAX) return `rgb(${red}, ${green}, ${blue})`;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / COLOR_CHANNEL_MAX})`;
}

/**
 * The root class (light / dark) is part of the cache key: a page without a
 * mounted chart has no theme observer to clear the cache when it flips, so a
 * chart mounted afterwards would otherwise read the other theme's colours.
 */
function themeCacheScope(): string {
  return document.documentElement?.className ?? "";
}

function probeCssColor(varName: string, fallback: string): string {
  if (typeof document === "undefined" || !document.body) return fallback;
  const cacheKey = `${themeCacheScope()}:${varName}:${fallback}`;
  const cached = colorProbeCache.get(cacheKey);
  if (cached) return cached;
  const probe = document.createElement("div");
  // Background does not inherit body text when a token is missing or invalid.
  probe.style.backgroundColor = `var(${varName}, ${fallback})`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).backgroundColor.trim();
  document.body.removeChild(probe);
  const final = toApexColor(computed, fallback);
  colorProbeCache.set(cacheKey, final);
  return final;
}

function readCssVariable(name: string, fallback: string): string {
  return probeCssColor(name, fallback);
}

function colorVariable(value: string): string | undefined {
  if (CSS_VARIABLE.test(value)) return value;
  const variable = CSS_VARIABLE_FUNCTION.exec(value);
  if (variable) return variable[1];
  const token = SHADE_TOKEN.exec(value);
  if (!token) return COLOR_NAME_TO_VAR[value];
  const scale = token[1] === "accent" ? "primary" : token[1];
  return `--ui-color-${scale}-${token[2]}`;
}

/** Resolve semantic colors, shade tokens and global CSS variables for Apex. */
export function resolveChartColor(value: string | undefined): string {
  const colorName = value ?? DEFAULT_COLOR_NAME;
  if (isHexLike(colorName)) return colorName;
  const variable = colorVariable(colorName);
  if (!variable) return colorName;
  return readCssVariable(variable, SAFE_HEX_FALLBACK);
}

/** Resolve a supplied color list or the unchanged default semantic palette. */
export function resolveChartColors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveChartColor(String(entry)));
  }
  if (typeof value === "string") return [resolveChartColor(value)];
  return DEFAULT_PALETTE.map((name) => resolveChartColor(name));
}

export function readThemeMuted(): string {
  return readCssVariable("--ui-text-muted", MUTED_FALLBACK);
}

export function readThemeHighlighted(): string {
  return readCssVariable("--ui-text-highlighted", "#ffffff");
}

/** Horizontal grid lines (v2 --chart-grid). */
export function readThemeBorder(): string {
  return readCssVariable("--dms-chart-grid", GRID_FALLBACK);
}

/** Axis labels and quiet chart text. */
export function readThemeDimmed(): string {
  return readCssVariable("--ui-text-dimmed", MUTED_FALLBACK);
}

/** Crosshair and other hairlines one notch above the grid. */
export function readThemeBorderAccented(): string {
  return readCssVariable("--ui-border-accented", GRID_FALLBACK);
}

/** Card surface, used to ring markers and separate stacked segments. */
export function readThemeSurface(): string {
  return readCssVariable("--ui-bg", SURFACE_FALLBACK);
}

/** Band behind radial tracks and empty donut rings. */
export function readThemeTrack(): string {
  return readCssVariable("--dms-bg-muted", GRID_FALLBACK);
}

/**
 * The mono font stack for SVG text: Apex writes it into a presentation
 * attribute, which cannot resolve `var()`.
 */
export function readThemeMonoFont(): string {
  if (typeof document === "undefined" || !document.documentElement) {
    return MONO_FONT_FALLBACK;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue?.(MONO_FONT_VARIABLE)
    ?.trim();
  return value || MONO_FONT_FALLBACK;
}
