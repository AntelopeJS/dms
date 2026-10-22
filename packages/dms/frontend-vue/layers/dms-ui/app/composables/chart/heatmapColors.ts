const HEX_SHORT_LENGTH = 3;
const HEX_LONG_LENGTH = 6;
const HEX_RADIX = 16;
const COLOR_CHANNEL_MAX = 255;
/** Below this relative luminance a card surface reads as a dark theme. */
const DARK_SURFACE_LUMINANCE = 0.5;
const LUMINANCE_WEIGHTS = { red: 0.2126, green: 0.7152, blue: 0.0722 };
const RGB_FUNCTION = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i;

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

function parseHex(color: string): RgbColor | null {
  const digits = color.slice(1);
  const long =
    digits.length === HEX_SHORT_LENGTH
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  if (long.length !== HEX_LONG_LENGTH) return null;
  const value = Number.parseInt(long, HEX_RADIX);
  if (Number.isNaN(value)) return null;
  return {
    red: (value >> 16) & COLOR_CHANNEL_MAX,
    green: (value >> 8) & COLOR_CHANNEL_MAX,
    blue: value & COLOR_CHANNEL_MAX,
  };
}

/** The channels of a resolved chart colour (`#hex` or comma `rgb()`). */
function parseColor(color: string): RgbColor | null {
  if (color.startsWith("#")) return parseHex(color);
  const match = RGB_FUNCTION.exec(color);
  if (!match) return null;
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
  };
}

/** Whether the card surface is a dark theme's. */
export function isDarkSurface(surface: string): boolean {
  const rgb = parseColor(surface);
  if (!rgb) return false;
  const luminance =
    (LUMINANCE_WEIGHTS.red * rgb.red +
      LUMINANCE_WEIGHTS.green * rgb.green +
      LUMINANCE_WEIGHTS.blue * rgb.blue) /
    COLOR_CHANNEL_MAX;
  return luminance < DARK_SURFACE_LUMINANCE;
}

/**
 * `color` laid over the card surface at `weight` (0 = the surface, 1 = the
 * colour): a faint cell fades into the card in both themes, rather than
 * towards white. A colour that cannot be read is kept as it is.
 */
function mixOverSurface(
  color: string,
  surface: string,
  weight: number,
): string {
  const front = parseColor(color);
  const back = parseColor(surface);
  if (!front || !back) return color;
  const channel = (key: keyof RgbColor) =>
    Math.round(back[key] + (front[key] - back[key]) * weight);
  return `rgb(${channel("red")}, ${channel("green")}, ${channel("blue")})`;
}

/**
 * The colours of a heatmap's value ranges, lowest first: each palette colour
 * over the surface, from `1 - intensity` of it for the lowest range to the
 * full colour for the highest.
 */
export function heatmapRangeColors(
  palette: string[],
  surface: string,
  intensity: number,
): string[] {
  const faintest = 1 - Math.min(Math.max(intensity, 0), 1);
  const lastIndex = Math.max(palette.length - 1, 1);
  return palette.map((color, index) =>
    mixOverSurface(
      color,
      surface,
      faintest + ((1 - faintest) * index) / lastIndex,
    ),
  );
}
