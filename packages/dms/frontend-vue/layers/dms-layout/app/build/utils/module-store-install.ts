import type {
  MissingInterface,
  StoreActionBody,
  StoreDependencyChoice,
} from "../../types/module-store";

/**
 * The radio value of the "Other npm package" choice: not an npm package
 * name, so no candidate can take it.
 */
export const OTHER_PACKAGE_CHOICE = ":other";

/**
 * An npm package name, scoped or not: never a path, a URL or a git source,
 * as the store only installs from the registry.
 */
const NPM_PACKAGE_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const NPM_PACKAGE_MAX_LENGTH = 214;

/** What the install dialog holds for one missing interface. */
export interface DependencyDraft {
  interfacePackage: string;
  /** A candidate's package, or {@link OTHER_PACKAGE_CHOICE}. */
  choice: string;
  /** The package typed for the "Other npm package" choice. */
  otherPackage: string;
  /** The config as typed, JSON; empty means none. */
  config: string;
}

/** Why a draft cannot be sent, by field: i18n keys under the dialog's errors. */
export type DependencyDraftError =
  | "package_required"
  | "package_invalid"
  | "config_invalid";

export interface DependencyDraftErrors {
  package?: DependencyDraftError;
  config?: DependencyDraftError;
}

/** A config as the dialog reads it: absent when left empty. */
export interface ParsedDependencyConfig {
  isValid: boolean;
  config?: Record<string, unknown>;
}

export function isNpmPackageName(value: string): boolean {
  return (
    value.length <= NPM_PACKAGE_MAX_LENGTH && NPM_PACKAGE_PATTERN.test(value)
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a typed config: empty is no config, anything else a JSON object. */
export function parseDependencyConfig(text: string): ParsedDependencyConfig {
  if (!text.trim()) return { isValid: true };
  try {
    const value: unknown = JSON.parse(text);
    return isPlainObject(value)
      ? { isValid: true, config: value }
      : { isValid: false };
  } catch {
    return { isValid: false };
  }
}

/**
 * One draft per missing interface, the first candidate picked. A draft of
 * an earlier attempt at the same interface is kept, so a retry starts from
 * what the owner typed.
 */
export function createDependencyDrafts(
  missing: readonly MissingInterface[],
  previous: readonly DependencyDraft[] = [],
): DependencyDraft[] {
  return missing.map(({ interfacePackage, candidates }) => {
    const earlier = previous.find(
      (draft) => draft.interfacePackage === interfacePackage,
    );
    if (earlier) return { ...earlier };
    return {
      interfacePackage,
      choice: candidates[0]?.package ?? OTHER_PACKAGE_CHOICE,
      otherPackage: "",
      config: "",
    };
  });
}

/** The package a draft installs, as the owner picked or typed it. */
export function draftPackage(draft: DependencyDraft): string {
  return draft.choice === OTHER_PACKAGE_CHOICE
    ? draft.otherPackage.trim()
    : draft.choice;
}

function packageError(
  draft: DependencyDraft,
): DependencyDraftError | undefined {
  const packageName = draftPackage(draft);
  if (!packageName) return "package_required";
  return isNpmPackageName(packageName) ? undefined : "package_invalid";
}

export function validateDependencyDraft(
  draft: DependencyDraft,
): DependencyDraftErrors {
  const errors: DependencyDraftErrors = {};
  const packageProblem = packageError(draft);
  if (packageProblem) errors.package = packageProblem;
  if (!parseDependencyConfig(draft.config).isValid) {
    errors.config = "config_invalid";
  }
  return errors;
}

export function areDependencyDraftsValid(
  drafts: readonly DependencyDraft[],
): boolean {
  return drafts.every(
    (draft) => Object.keys(validateDependencyDraft(draft)).length === 0,
  );
}

function toDependencyChoice(draft: DependencyDraft): StoreDependencyChoice {
  const { config } = parseDependencyConfig(draft.config);
  const choice: StoreDependencyChoice = {
    interfacePackage: draft.interfacePackage,
    package: draftPackage(draft),
  };
  if (config) choice.config = config;
  return choice;
}

/** The install request for module `id`, from drafts already validated. */
export function buildInstallBody(
  id: string,
  drafts: readonly DependencyDraft[],
): StoreActionBody {
  if (drafts.length === 0) return { id };
  return { id, dependencies: drafts.map(toDependencyChoice) };
}
