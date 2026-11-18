import { PALETTE_SHADES } from "./catalog";
import type { ThemeDraft, ThemeVariables } from "./theme-types";

/** The palette name a custom accent is written under: `ui.colors.primary` and `--color-brand-*`. */
export const CUSTOM_PALETTE = "brand";

type Shade = (typeof PALETTE_SHADES)[number];

/** The shade that holds the picked color itself, as Nuxt UI paints primary in light mode. */
const ANCHOR_SHADE: Shade = 500;

/** Nuxt UI reads this shade for solid fills in both themes (`--dms-accent-fill`). */
const FILL_SHADE: Shade = 400;

/** The shade the DMS draws accent text with on a white page (`--ui-primary`, light). */
const TEXT_SHADE: Shade = 700;

const DARKEST_SHADE: Shade = 950;

/** WCAG AA for normal text. */
export const AA_CONTRAST = 4.5;

/**
 * `--dms-accent-on-fill` is `color-mix(in srgb, <950> 50%, black)` in
 * `main.css`: each channel of the 950 shade, halved.
 */
const ON_FILL_MIX = 0.5;

const LIGHTNESS_STEP = 0.005;

/** The lightness each shade has in a typical Tailwind palette: the ramp's pattern. */
const REFERENCE_LIGHTNESS: Record<Shade, number> = {
  50: 0.977,
  100: 0.936,
  200: 0.885,
  300: 0.808,
  400: 0.704,
  500: 0.637,
  600: 0.577,
  700: 0.505,
  800: 0.444,
  900: 0.396,
  950: 0.283,
};

/** How much of the picked color's chroma each shade keeps. */
const CHROMA_SHARE: Record<Shade, number> = {
  50: 0.1,
  100: 0.2,
  200: 0.4,
  300: 0.65,
  400: 0.85,
  500: 1,
  600: 0.95,
  700: 0.8,
  800: 0.65,
  900: 0.5,
  950: 0.35,
};

type Triplet = readonly [number, number, number];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** `#rgb` or `#rrggbb`, as typed; undefined for anything else. */
export function normalizeHex(value: string): string | undefined {
  const text = value.trim();
  if (!HEX_COLOR.test(text)) return undefined;
  const short = SHORT_HEX.exec(text);
  const full = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : text;
  return full.toLowerCase();
}

function mapTriplet(
  triplet: Triplet,
  change: (channel: number) => number,
): Triplet {
  return [change(triplet[0]), change(triplet[1]), change(triplet[2])];
}

function channelsOf(hex: string): Triplet {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

function hexOfChannels(channels: Triplet): string {
  const [red, green, blue] = mapTriplet(channels, (channel) =>
    Math.round(Math.min(255, Math.max(0, channel))),
  );
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toLinear(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function fromLinear(linear: number): number {
  const unit =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return unit * 255;
}

/** The WCAG relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [red, green, blue] = mapTriplet(channelsOf(hex), toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast ratio of two `#rrggbb` colors, 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [one, other] = [luminance(first), luminance(second)];
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

interface Oklch {
  lightness: number;
  chroma: number;
  hue: number;
}

function oklchOf(hex: string): Oklch {
  const [red, green, blue] = mapTriplet(channelsOf(hex), toLinear);
  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  const lightness =
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return {
    lightness,
    chroma: Math.hypot(a, b),
    hue: Math.atan2(b, a),
  };
}

function linearChannels({ lightness, chroma, hue }: Oklch): Triplet {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

const GAMUT_SLACK = 0.0005;

function isInGamut(color: Oklch): boolean {
  return linearChannels(color).every(
    (channel) => channel >= -GAMUT_SLACK && channel <= 1 + GAMUT_SLACK,
  );
}

const GAMUT_SEARCH_STEPS = 18;

/** The color with the most chroma, up to the asked one, that sRGB can show at that lightness and hue. */
function hexInGamut(color: Oklch): string {
  let fitted = color;
  if (!isInGamut(color)) {
    let low = 0;
    let high = color.chroma;
    for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
      const middle = (low + high) / 2;
      if (isInGamut({ ...color, chroma: middle })) low = middle;
      else high = middle;
    }
    fitted = { ...color, chroma: low };
  }
  return hexOfChannels(mapTriplet(linearChannels(fitted), fromLinear));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const ANCHOR_INDEX = PALETTE_SHADES.indexOf(ANCHOR_SHADE);

/**
 * Each shade's lightness: the typical ramp's pattern, stretched so the picked
 * color's lightness lands on {@link ANCHOR_SHADE}, with the lightest shade
 * above it and the darkest below it.
 */
function rampLightness(anchor: number): number[] {
  const lightest = Math.max(REFERENCE_LIGHTNESS[50], anchor + (1 - anchor) / 2);
  const darkest = Math.min(REFERENCE_LIGHTNESS[950], anchor / 2);
  const referenceAnchor = REFERENCE_LIGHTNESS[ANCHOR_SHADE];
  return PALETTE_SHADES.map((shade) => {
    const reference = REFERENCE_LIGHTNESS[shade];
    if (shade === ANCHOR_SHADE) return anchor;
    if (reference > referenceAnchor) {
      const share =
        (reference - referenceAnchor) /
        (REFERENCE_LIGHTNESS[50] - referenceAnchor);
      return anchor + share * (lightest - anchor);
    }
    const share =
      (referenceAnchor - reference) /
      (referenceAnchor - REFERENCE_LIGHTNESS[950]);
    return anchor - share * (anchor - darkest);
  });
}

function at(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/** Keeps the lightness strictly falling from the lightest shade to the darkest, the anchor fixed. */
function keepFalling(lightness: number[]): void {
  for (let index = ANCHOR_INDEX - 1; index >= 0; index--) {
    lightness[index] = clampUnit(
      Math.max(at(lightness, index), at(lightness, index + 1) + LIGHTNESS_STEP),
    );
  }
  for (let index = ANCHOR_INDEX + 1; index < lightness.length; index++) {
    lightness[index] = clampUnit(
      Math.min(at(lightness, index), at(lightness, index - 1) - LIGHTNESS_STEP),
    );
  }
}

function indexOfShade(shade: Shade): number {
  return PALETTE_SHADES.indexOf(shade);
}

function shadeHex(
  base: Oklch,
  shade: Shade,
  lightness: readonly number[],
): string {
  return hexInGamut({
    lightness: at(lightness, indexOfShade(shade)),
    chroma: base.chroma * CHROMA_SHARE[shade],
    hue: base.hue,
  });
}

/** The ink on an accent fill, as `main.css` derives it from the 950 shade. */
export function onFillOf(darkestShade: string): string {
  return hexOfChannels(
    mapTriplet(channelsOf(darkestShade), (channel) => channel * ON_FILL_MIX),
  );
}

const READABLE_SEARCH_LIMIT = 200;

/**
 * Lowers the text shade's lightness until it reads on a white page, then
 * raises the fill shade's until the ink on it reads, so both pass AA.
 */
function makeReadable(base: Oklch, lightness: number[]): void {
  const hexOf = (shade: Shade) => shadeHex(base, shade, lightness);
  const textIndex = indexOfShade(TEXT_SHADE);
  for (
    let attempt = 0;
    attempt < READABLE_SEARCH_LIMIT &&
    contrastRatio(hexOf(TEXT_SHADE), "#ffffff") < AA_CONTRAST;
    attempt++
  ) {
    lightness[textIndex] = at(lightness, textIndex) - LIGHTNESS_STEP;
    keepFalling(lightness);
  }
  const fillIndex = indexOfShade(FILL_SHADE);
  for (
    let attempt = 0;
    attempt < READABLE_SEARCH_LIMIT &&
    contrastRatio(hexOf(FILL_SHADE), onFillOf(hexOf(DARKEST_SHADE))) <
      AA_CONTRAST;
    attempt++
  ) {
    lightness[fillIndex] = at(lightness, fillIndex) + LIGHTNESS_STEP;
    keepFalling(lightness);
  }
}

/** One color, as `#rrggbb`, for each shade of {@link PALETTE_SHADES}, in that order. */
export type BrandPalette = readonly { shade: Shade; hex: string }[];

/**
 * The 11 shades of a brand palette built around a picked color. The color is
 * shade 500 exactly. The other shades keep its hue and follow the lightness
 * and chroma of a typical ramp in OKLCH, clipped to what sRGB can show. The
 * lightness falls from 50 to 950. Shade 400, the accent fill, is made light
 * enough for the ink on it (`--dms-accent-on-fill`) to reach AA, and shade
 * 700, the accent text on white, dark enough to reach AA there.
 */
export function brandPalette(color: string): BrandPalette | undefined {
  const picked = normalizeHex(color);
  if (!picked) return undefined;
  const base = oklchOf(picked);
  const lightness = rampLightness(base.lightness);
  keepFalling(lightness);
  makeReadable(base, lightness);
  return PALETTE_SHADES.map((shade) => ({
    shade,
    hex: shade === ANCHOR_SHADE ? picked : shadeHex(base, shade, lightness),
  }));
}

/** The name of a brand shade variable: `--color-brand-500`. */
export function brandVariableName(shade: Shade): string {
  return `--color-${CUSTOM_PALETTE}-${shade}`;
}

const BRAND_VARIABLES = new Set(PALETTE_SHADES.map(brandVariableName));

/** Whether a variable is one of the 11 the editor writes for a custom accent. */
export function isBrandVariable(name: string): boolean {
  return BRAND_VARIABLES.has(name);
}

/** The shade variables of a brand palette, for the shared set. */
export function brandVariables(palette: BrandPalette): ThemeVariables {
  return Object.fromEntries(
    palette.map(({ shade, hex }) => [brandVariableName(shade), hex]),
  );
}

/**
 * The color of the draft's custom accent, as `#rrggbb`: its brand palette's
 * 500 shade, when the primary palette is the brand one. Undefined for a preset,
 * or for a palette whose 500 is not a hex color.
 */
export function customAccentOf(draft: ThemeDraft): string | undefined {
  if (draft.colors.primary !== CUSTOM_PALETTE) return undefined;
  const value = draft.variables.shared[brandVariableName(ANCHOR_SHADE)];
  return value === undefined ? undefined : normalizeHex(value);
}
