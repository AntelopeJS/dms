import type {
  ConfirmDialog,
  ConfirmDialogSecondaryAction,
  ConfirmDialogSecondaryTarget,
} from "#dms-core/app/types/confirm-dialog";
import {
  interpolateRowText,
  interpolateUrl,
} from "#dms-core/app/utils/url-interpolation";
import { readTranslationKey } from "#dms-core/app/composables/translation/useTranslation";
import type {
  ConfirmOptions,
  ConfirmSecondaryAction,
} from "../../../composables/confirm/types";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";
import { interpolateLiteral } from "../../utils/literalText";
import {
  namesPageValue,
  resolveLinkVariables,
  resolveTextVariables,
} from "../../utils/urlVariables";
import { currentPageUrlValues } from "../page/pageUrlValues";

/** `t` as vue-i18n gives it: named parameters, then the plural count. */
export type ConfirmTranslate = (
  key: string,
  params: Record<string, unknown>,
  plural?: number,
) => string;

/**
 * One text of a confirmation dialog: an i18n key (with `$`) translated with
 * `params` — pluralized on `params.count` when it is a number — or a literal
 * filled in with the same `params`.
 */
export function resolveConfirmText(
  text: string,
  params: Record<string, unknown>,
  t: ConfirmTranslate,
): string {
  const { isKey, key } = readTranslationKey(text);
  if (!isKey) return interpolateLiteral(text, params);
  return typeof params.count === "number"
    ? t(key, params, params.count)
    : t(key, params);
}

/** Runs a dialog's secondary target, its URL already filled in. */
export type SecondaryTargetRun = (
  target: ConfirmDialogSecondaryTarget,
) => Promise<void> | void;

// The page's `{{params.X}}` / `{{query.X}}` come first, as on an action's own
// target; the route is only read for a text holding such a token.
function withPageLink(url: string): string {
  return namesPageValue(url)
    ? resolveLinkVariables(url, currentPageUrlValues())
    : url;
}

function withPageText(text: string): string | undefined {
  return namesPageValue(text)
    ? resolveTextVariables(text, currentPageUrlValues())
    : text;
}

/**
 * A dialog's secondary target with its URL (and file name) filled in with
 * the page's values and, as `{{row.X}}`, the same parameters as its texts.
 */
function resolveSecondaryTarget(
  target: ConfirmDialogSecondaryTarget,
  params: Record<string, unknown>,
): ConfirmDialogSecondaryTarget {
  const url = interpolateUrl(withPageLink(target.url), params);
  if (target.type !== "download" || target.filename === undefined) {
    return { ...target, url };
  }
  return {
    ...target,
    url,
    filename: withPageText(interpolateRowText(target.filename, params)),
  };
}

function resolveSecondaryAction(
  action: ConfirmDialogSecondaryAction | undefined,
  params: Record<string, unknown>,
  t: ConfirmTranslate,
  runTarget: SecondaryTargetRun | undefined,
): ConfirmSecondaryAction | undefined {
  if (!action || !runTarget) return undefined;
  const target = resolveSecondaryTarget(action.target, params);
  return {
    label: resolveConfirmText(action.label, params, t),
    icon: action.icon,
    run: () => runTarget(target),
  };
}

/**
 * A confirmation dialog with its texts resolved, ready for `useConfirm()`:
 * interpolated with the row's fields (`row`) and the dialog's own `params`.
 * Its secondary action is drawn only when given `runTarget` to run it with.
 */
export function resolveConfirmDialog(
  dialog: ConfirmDialog,
  row: Record<string, unknown> | undefined,
  t: ConfirmTranslate,
  runTarget?: SecondaryTargetRun,
): ConfirmOptions {
  const params = { ...row, ...dialog.params };
  const text = (value: string | undefined) =>
    value === undefined ? undefined : resolveConfirmText(value, params, t);
  const { params: _params, secondaryAction, ...rest } = dialog;
  return {
    ...rest,
    secondaryAction: resolveSecondaryAction(
      secondaryAction,
      params,
      t,
      runTarget,
    ),
    title: text(dialog.title) ?? "",
    description: text(dialog.description),
    confirmLabel: text(dialog.confirmLabel),
    cancelLabel: text(dialog.cancelLabel),
    impact: dialog.impact?.map((entry) => ({
      ...entry,
      label: text(entry.label) ?? "",
      count: typeof entry.count === "string" ? text(entry.count) : entry.count,
    })),
    fields: dialog.fields?.map((field) =>
      processFieldI18n(
        {
          ...field,
          label: text(field.label),
          description: text(field.description),
        },
        (key) => resolveConfirmText(key, params, t),
      ),
    ),
  };
}
