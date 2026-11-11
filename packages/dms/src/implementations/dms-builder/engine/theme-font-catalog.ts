/**
 * The fonts the builder hosts with a theme: Google Fonts families under the
 * SIL Open Font License, as Fontsource packages them. Each is pinned to a
 * release, and a release's files never change on the CDN, so every machine
 * that saves the theme writes the same bytes.
 *
 * Mirrored in `frontend-vue/app/runtime/theme-fonts.ts`, which offers them and
 * shows them before the save; a test there keeps the two equal. Nothing here
 * imports anything, so that test can load this file as it is.
 */
export interface HostedFont {
  /** The family the stylesheet declares, and a font stack names. */
  family: string;
  /** Published as `@fontsource-variable/<packageName>`. */
  packageName: string;
  version: string;
  /** The range of the variable `wght` axis the files carry. */
  weights: [number, number];
  /** Whether the family has italic files; without, the browser slants it. */
  italic: boolean;
}

export const HOSTED_FONTS: HostedFont[] = [
  {
    family: "Inter",
    packageName: "inter",
    version: "5.3.0",
    weights: [100, 900],
    italic: true,
  },
  {
    family: "IBM Plex Sans",
    packageName: "ibm-plex-sans",
    version: "5.3.0",
    weights: [100, 700],
    italic: true,
  },
  {
    family: "Public Sans",
    packageName: "public-sans",
    version: "5.3.0",
    weights: [100, 900],
    italic: true,
  },
  {
    family: "DM Sans",
    packageName: "dm-sans",
    version: "5.3.0",
    weights: [100, 1000],
    italic: true,
  },
  {
    family: "Manrope",
    packageName: "manrope",
    version: "5.3.0",
    weights: [200, 800],
    italic: false,
  },
  {
    family: "Plus Jakarta Sans",
    packageName: "plus-jakarta-sans",
    version: "5.3.0",
    weights: [200, 800],
    italic: true,
  },
  {
    family: "Figtree",
    packageName: "figtree",
    version: "5.3.0",
    weights: [300, 900],
    italic: true,
  },
  {
    family: "Atkinson Hyperlegible Next",
    packageName: "atkinson-hyperlegible-next",
    version: "5.3.0",
    weights: [200, 800],
    italic: true,
  },
  {
    family: "Nunito",
    packageName: "nunito",
    version: "5.3.0",
    weights: [200, 1000],
    italic: true,
  },
  {
    family: "Source Serif 4",
    packageName: "source-serif-4",
    version: "5.3.1",
    weights: [200, 900],
    italic: true,
  },
];

/**
 * The scripts a hosted font covers, each one file per style, and the
 * characters in it: every language written in the Latin alphabet. A page
 * downloads a file only once it shows one of its characters.
 */
export const FONT_SUBSET_NAMES = ["latin-ext", "latin"] as const;

export type FontSubset = (typeof FONT_SUBSET_NAMES)[number];

export const FONT_SUBSETS = {
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
} as const satisfies Record<FontSubset, string>;

/** Where the packages are fetched from: jsDelivr's mirror of npm. */
export const FONT_PACKAGES_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource-variable";
