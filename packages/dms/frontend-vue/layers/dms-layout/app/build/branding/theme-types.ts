/**
 * The theme shapes of `@antelopejs/interface-dms-builder` (`theme.ts`,
 * `results.ts`), mirrored because the frontend workspace does not resolve that
 * package. The `/api/branding` routes answer with these.
 */

export type ThemeMode = "light" | "dark";

export type ThemeVariables = Record<string, string>;

export interface ThemeVariableSets {
  shared: ThemeVariables;
  light: ThemeVariables;
  dark: ThemeVariables;
}

export type ThemeVariableSetName = keyof ThemeVariableSets;

export type ThemeColorRole =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info";

export type ThemeColors = Partial<Record<ThemeColorRole, string>>;

export type LogoSlot = "default" | "collapsed" | "email" | "favicon";

export type LogoPathsByMode = Partial<Record<ThemeMode, string>>;

export type ThemeLogos = Partial<Record<LogoSlot, LogoPathsByMode>>;

export interface LogoUpload {
  slot: LogoSlot;
  mode: ThemeMode;
  contentType: string;
  base64Content: string;
}

export interface ThemeLayer {
  name: string;
  sourcePath: string;
}

/** The theme as its files hold it, without the uploads only a save carries. */
export interface ThemeDraft {
  variables: ThemeVariableSets;
  colors: ThemeColors;
  logos: ThemeLogos;
}

/** The body `SetTheme` takes. */
export interface SetThemeDraft extends ThemeDraft {
  uploads: LogoUpload[];
}

export interface ThemeStructure extends ThemeDraft {
  layer: ThemeLayer;
  version: string;
}

export interface ValidationIssue {
  pointer: string;
  message: string;
}

export type BuilderError =
  | { code: "not_found"; ref: string }
  | { code: "duplicate_name"; name: string; scope: string }
  | { code: "invalid_config"; issues: ValidationIssue[] }
  | { code: "opaque_target"; path: unknown }
  | { code: "unsupported"; detail: string }
  | { code: "referential_integrity"; blockedBy: string[] }
  | { code: "stale"; ref: string; currentVersion: string }
  | {
      code: "typecheck_failed";
      diagnostics: { file: string; line: number; message: string }[];
    };

/** A request to `/api/branding` that got no answer from the builder: signed out, refused or offline. */
export interface RequestFailure {
  code: "request_failed";
  detail: string;
}

/** Why a theme operation came back without its data. */
export type ThemeRefusal = BuilderError | RequestFailure;

export interface OpWarning {
  code: string;
  message: string;
}

export type OpResult<T> =
  | { ok: true; data: T; warnings?: OpWarning[] }
  | { ok: false; error: ThemeRefusal };

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];

export const VARIABLE_SET_NAMES: readonly ThemeVariableSetName[] = [
  "shared",
  "light",
  "dark",
];
