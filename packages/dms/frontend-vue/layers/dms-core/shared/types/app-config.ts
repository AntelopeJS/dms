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
  logo?: {
    default: DmsLogoSources;
    collapsed: DmsLogoSources;
  };
  footer?: DmsFooterConfig;
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
