import { decodeApiFailure } from "../build/composables/api-error";

/** The supported tones for request failures. */
export type ApiErrorSeverity = "info" | "warning" | "error";

/** Localized text and tone for an inline error. */
export interface ApiErrorNotice {
  readonly message: string;
  readonly severity: ApiErrorSeverity;
}

/** Placeholder values accepted by error translations. */
export type ApiErrorParams = Readonly<
  Record<string, string | number | boolean>
>;

/** Keys are resolved against loaded catalogs and never displayed verbatim. */
export interface ResolveApiErrorOptions {
  readonly fallbackKey: string;
  readonly params?: ApiErrorParams;
}

/** A contextual action whose label is also a loaded translation key. */
export interface ApiErrorAction {
  readonly labelKey: string;
  readonly onSelect: () => void | Promise<void>;
}

/** An existing progress notification, not the identity of a failure. */
export type ApiErrorToastId = string | number;

/** Toast presentation never overrides the server's translated reason or tone. */
export interface PresentApiErrorOptions extends ResolveApiErrorOptions {
  readonly actions?: readonly ApiErrorAction[];
  readonly replaceToastId?: ApiErrorToastId;
}

/** Anything thrown or rejected, as `decodeApiFailure` reads it. */
type ApiFailure = Parameters<typeof decodeApiFailure>[0];

/** Captured during setup and callable after awaits. */
export interface ApiErrorPresenter {
  resolveError(
    error: ApiFailure,
    options: ResolveApiErrorOptions,
  ): ApiErrorNotice | null;
  presentError(error: ApiFailure, options: PresentApiErrorOptions): void;
}

const GENERIC_KEY = "error.500.description";
const PRESENTED_STATE_KEY = "dms.apiErrors.presentedResponses";
const FAILURE_DURATION_MS = 5000;
const ICONS: Record<ApiErrorSeverity, string> = {
  info: "i-ph-info",
  warning: "i-ph-warning",
  error: "i-ph-warning-circle",
};

/** A message vue-i18n compiled ahead of time: its AST, typed `0` at the root. */
type CompiledMessage = { type: 0 } | { t: 0 };

/** A message `rt` renders: its source text, a message function or a compiled AST. */
type RenderableMessage =
  | string
  | ((...args: never[]) => string)
  | CompiledMessage;

function isRenderableMessage(value: unknown): value is RenderableMessage {
  if (typeof value === "string" || typeof value === "function") return true;
  return (
    value !== null &&
    typeof value === "object" &&
    (("type" in value && value.type === 0) || ("t" in value && value.t === 0))
  );
}

/**
 * Resolves errors without side effects and presents at most one toast per failed
 * Response in this app. Aborts without a failed response are silent.
 */
export function useApiErrorPresenter(): ApiErrorPresenter {
  const toast = useToast();
  const { i18n } = getPluginI18n();
  const presented = useDmsState(
    PRESENTED_STATE_KEY,
    () => new WeakMap<object, ApiErrorToastId | null>(),
  );

  function lookup(
    key: string | undefined,
    params: ApiErrorParams = {},
  ): string | null {
    if (!key) return null;
    try {
      const message = i18n.tm(key.startsWith("$") ? key.slice(1) : key);
      if (!isRenderableMessage(message)) return null;
      return i18n.rt(message, params);
    } catch {
      return null;
    }
  }

  function noticeOf(
    failure: ReturnType<typeof decodeApiFailure>,
    options: ResolveApiErrorOptions,
  ): ApiErrorNotice | null {
    if (failure.cancelled) return null;
    const params = { ...failure.params, ...options.params };
    const message =
      lookup(failure.key, params) ??
      lookup(options.fallbackKey, params) ??
      lookup(GENERIC_KEY);
    if (message === null)
      throw new Error(
        "The core error.500.description translation must be loaded",
      );
    return { message, severity: failure.severity };
  }

  function resolveError(
    error: ApiFailure,
    options: ResolveApiErrorOptions,
  ): ApiErrorNotice | null {
    return noticeOf(decodeApiFailure(error), options);
  }

  function presentError(
    error: ApiFailure,
    options: PresentApiErrorOptions,
  ): void {
    if (import.meta.env.SSR) return;
    const failure = decodeApiFailure(error);
    const notice = noticeOf(failure, options);
    const replacement = options.replaceToastId;
    const identity = failure.identity;
    if (!notice || (identity && presented.value.has(identity))) {
      if (
        replacement !== undefined &&
        (!identity || presented.value.get(identity) !== replacement)
      )
        toast.remove(replacement);
      return;
    }
    const payload = {
      title: notice.message,
      description: undefined,
      color: notice.severity,
      icon: ICONS[notice.severity],
      duration: FAILURE_DURATION_MS,
      progress: true,
      actions: options.actions?.flatMap((action) => {
        const label = lookup(action.labelKey);
        return label === null ? [] : [{ label, onClick: action.onSelect }];
      }),
    };
    if (identity) presented.value.set(identity, replacement ?? null);
    try {
      if (replacement !== undefined) toast.update(replacement, payload);
      else {
        const added = toast.add(payload);
        if (identity) presented.value.set(identity, added.id);
      }
    } catch (error) {
      if (identity) presented.value.delete(identity);
      throw error;
    }
  }

  return { presentError, resolveError };
}
