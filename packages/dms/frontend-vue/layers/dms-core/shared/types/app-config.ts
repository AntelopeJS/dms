/**
 * Application configuration shared by DMS frontend modules.
 */
export interface DmsUiConfig {
  [key: string]: unknown;
  icons: Record<string, string>;
}

/** One logo, in the two color modes the dashboard switches between. */
export interface DmsLogoSources {
  light: string;
  dark: string;
}

/** The logos of an instance, one per place it is drawn. */
export interface DmsBrandingLogo {
  /** The expanded sidebar and the auth pages. */
  default: DmsLogoSources;
  /** The icon-only sidebar. */
  collapsed: DmsLogoSources;
  /**
   * The header of the emails, in place of `default.light`. A PNG or a JPEG:
   * Gmail and Outlook refuse SVG, and an email leaves out a logo they cannot
   * load. `dark` goes to the mail clients that follow the reader's dark mode.
   */
  email?: DmsLogoSources;
  /**
   * The browser tab icon. `light` and `dark` follow the operating system's
   * color scheme, not the dashboard's color mode: the browser draws the tab
   * outside the page.
   */
  favicon?: DmsLogoSources;
}

/**
 * The Tailwind palette each Nuxt UI color role resolves to (`ui.colors`): a
 * stock palette name, or one whose `--color-<name>-*` shades a stylesheet
 * declares.
 */
export interface DmsUiColors {
  primary: string;
  secondary: string;
  neutral: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

/**
 * The DMS's own logos and palettes, kept whatever a layer sets in their place,
 * so a tool can preview a return to the DMS look (the builder's theme editor).
 * A layer overrides `branding.logo` and `ui.colors`, never these.
 */
export interface DmsBrandingDefaults {
  logo: DmsBrandingLogo;
  colors: DmsUiColors;
}

/**
 * What the footer of the public and auth pages shows besides its links
 * (`registerFooterLink`).
 */
export interface DmsFooterConfig {
  /**
   * Name after the `©`, a literal or a `$`-prefixed i18n key; `false` drops
   * the copyright.
   */
  copyright?: string | false;
  /** The GitHub "Star" button of the DMS repository. */
  githubStar?: boolean;
  /** The language picker. */
  localeSwitcher?: boolean;
}

export interface DmsBrandingConfig {
  /**
   * Absent when an instance ships no logo of its own; the layer's app config
   * supplies the AntelopeJS one by default.
   */
  logo?: DmsBrandingLogo;
  footer?: DmsFooterConfig;
  /** Supplied by the DMS layout layer's app config. */
  defaults?: DmsBrandingDefaults;
}

export interface DmsAppConfig {
  [key: string]: unknown;
  ui: DmsUiConfig;
  branding: DmsBrandingConfig;
}

declare module "#dms/frontend-module" {
  interface DmsAppConfig {
    ui: DmsUiConfig;
    branding: DmsBrandingConfig;
  }
}
