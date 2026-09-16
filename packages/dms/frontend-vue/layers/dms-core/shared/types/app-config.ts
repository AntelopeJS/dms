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

export interface DmsBrandingConfig {
  /**
   * Absent when an instance ships no logo of its own; the layer's app config
   * supplies the AntelopeJS one by default.
   */
  logo?: {
    default: DmsLogoSources;
    collapsed: DmsLogoSources;
  };
}

export interface DmsAppConfig {
  [key: string]: unknown;
  ui: DmsUiConfig;
  branding: DmsBrandingConfig;
}

declare module "#dms-inertia/frontend-module" {
  interface DmsAppConfig {
    ui: DmsUiConfig;
    branding: DmsBrandingConfig;
  }
}
