import { Logging } from "@antelopejs/interface-core/logging";
import type { FormKind, FormProps, FormSaveMode } from "../form-types";

type FormFooterAlias = "showActions" | "saveBar" | "cancellable";

const warnedAliases = new Set<FormFooterAlias>();

const ALIAS_REPLACEMENTS: Record<FormFooterAlias, string> = {
  showActions: "saveMode",
  saveBar: "saveMode",
  cancellable: "kind",
};

function warnAlias(alias: FormFooterAlias): void {
  if (warnedAliases.has(alias)) return;
  warnedAliases.add(alias);
  Logging.Warn(
    `[DMS] Form option "${alias}" is deprecated and goes in 0.5; use "${ALIAS_REPLACEMENTS[alias]}".`,
  );
}

function saveModeOf(options: FormProps): FormSaveMode | undefined {
  if (options.saveMode) return options.saveMode;
  if (options.showActions === false) return "none";
  if (options.saveBar === true) return "bar";
  if (options.saveBar === false || options.showActions === true) {
    return "footer";
  }
  return undefined;
}

function kindOf(options: FormProps): FormKind | undefined {
  if (options.kind) return options.kind;
  if (options.cancellable === undefined) return undefined;
  return options.cancellable ? "record" : "action";
}

/**
 * `options` with the deprecated footer flags (`showActions`, `saveBar`,
 * `cancellable`) read into `saveMode` and `kind`, which win when set, and
 * dropped. Each flag in use is warned about once.
 *
 * @internal
 */
export function resolveFormFooterAliases<T extends FormProps>(options: T): T {
  const aliases = (Object.keys(ALIAS_REPLACEMENTS) as FormFooterAlias[]).filter(
    (alias) => options[alias] !== undefined,
  );
  if (aliases.length === 0) return options;
  aliases.forEach(warnAlias);
  const {
    showActions: _showActions,
    saveBar: _saveBar,
    cancellable: _cancellable,
    ...rest
  } = options;
  const saveMode = saveModeOf(options);
  const kind = kindOf(options);
  return {
    ...rest,
    ...(saveMode ? { saveMode } : {}),
    ...(kind ? { kind } : {}),
  } as T;
}
