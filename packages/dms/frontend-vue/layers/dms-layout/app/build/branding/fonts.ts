/**
 * The fonts the engine hosts (`theme-font-catalog.ts` in the module): Save
 * downloads the one picked into the project; until then it is shown from the
 * CDN the engine downloads it from.
 */
export interface ThemeFont {
  family: string;
  /** Published as `@fontsource-variable/<packageName>`. */
  packageName: string;
  version: string;
  weights: [number, number];
  italic: boolean;
  generic: "sans-serif" | "serif";
}

const font = (
  family: string,
  packageName: string,
  weights: [number, number],
  options: Partial<Pick<ThemeFont, "version" | "italic" | "generic">> = {},
): ThemeFont => ({
  family,
  packageName,
  weights,
  version: options.version ?? "5.3.0",
  italic: options.italic ?? true,
  generic: options.generic ?? "sans-serif",
});

export const THEME_FONTS: ThemeFont[] = [
  font("Inter", "inter", [100, 900]),
  font("IBM Plex Sans", "ibm-plex-sans", [100, 700]),
  font("Public Sans", "public-sans", [100, 900]),
  font("DM Sans", "dm-sans", [100, 1000]),
  font("Manrope", "manrope", [200, 800], { italic: false }),
  font("Plus Jakarta Sans", "plus-jakarta-sans", [200, 800]),
  font("Figtree", "figtree", [300, 900]),
  font("Atkinson Hyperlegible Next", "atkinson-hyperlegible-next", [200, 800]),
  font("Nunito", "nunito", [200, 1000]),
  font("Source Serif 4", "source-serif-4", [200, 900], {
    version: "5.3.1",
    generic: "serif",
  }),
];

/** What the DMS shows without a theme font. */
export const DMS_FONT_FAMILY = "Geist";

const FONT_SUBSETS = {
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};

const FONT_PACKAGES_URL = "https://cdn.jsdelivr.net/npm/@fontsource-variable";

const GENERIC_STACKS: Record<ThemeFont["generic"], string> = {
  "sans-serif": "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
};

/** The `--font-sans` value for a font: the font, then the system's while it loads. */
export function fontStack(
  entry: Pick<ThemeFont, "family" | "generic">,
): string {
  return `"${entry.family}", ${GENERIC_STACKS[entry.generic]}`;
}

function unquoted(name: string): string {
  const quote = name[0];
  return (quote === '"' || quote === "'") && name.endsWith(quote)
    ? name.slice(1, -1)
    : name;
}

/** The catalog font a stack starts with, as the engine tells which font to host. */
export function themeFontOf(stack: string | undefined): ThemeFont | undefined {
  const leading = unquoted(stack?.split(",")[0]?.trim() ?? "").toLowerCase();
  return THEME_FONTS.find((entry) => entry.family.toLowerCase() === leading);
}

/** Every catalog font declared from the CDN; a browser fetches a face only once text uses it. */
export function catalogFontFaces(): string {
  return THEME_FONTS.flatMap((entry) =>
    (entry.italic ? ["normal", "italic"] : ["normal"]).flatMap((style) =>
      Object.entries(FONT_SUBSETS).map(
        ([subset, range]) =>
          `@font-face { font-family: "${entry.family}"; font-style: ${style}; font-weight: ${entry.weights[0]} ${entry.weights[1]}; font-display: swap; src: url("${FONT_PACKAGES_URL}/${entry.packageName}@${entry.version}/files/${entry.packageName}-${subset}-wght-${style}.woff2") format("woff2"); unicode-range: ${range}; }`,
      ),
    ),
  ).join("\n");
}

const FONTS_STYLE_ID = "dms-branding-fonts";

/** Declares the catalog fonts once; returns the function that removes them. */
export function declareCatalogFonts(): () => void {
  if (!document.getElementById(FONTS_STYLE_ID)) {
    const element = document.createElement("style");
    element.id = FONTS_STYLE_ID;
    element.textContent = catalogFontFaces();
    document.head.append(element);
  }
  return () => document.getElementById(FONTS_STYLE_ID)?.remove();
}
