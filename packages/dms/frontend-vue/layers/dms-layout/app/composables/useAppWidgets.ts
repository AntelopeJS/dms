/**
 * A framed app widget. Unlike a free overlay (see {@link useAppOverlay}), the
 * DMS owns the presentation: it renders a low-opacity icon chip anchored in the
 * bottom-left corner of the page, stacks it with the other widgets, and unfolds
 * `body` into an animated card on hover. Modules only declare metadata.
 *
 * Every field is a serializable string, so a widget can be registered from a
 * regular (SSR-safe) plugin. Conditional visibility is the widget's own
 * responsibility: `register` when it has something to show, `unregister`
 * otherwise (both are idempotent / keyed by `id`).
 */
export interface AppWidget {
  /** Unique key: dedup on `register` (upsert) and target of `unregister`. */
  id: string;
  /** Icon name (`i-ph-…`) shown in the dock chip. */
  icon: string;
  /**
   * Chip tooltip / accessible name. Resolved through the DMS i18n convention:
   * a plain literal, or an i18n key when prefixed with "$" (e.g.
   * "$my.module.widget.label"). See `useTranslation().processI18n`.
   */
  label: string;
  /** Name of a global component rendered inside the unfolded card. */
  body: string;
  /**
   * Stack order, ascending from the bottom. Defaults to `0`; widgets sharing
   * the same effective order preserve registration order.
   */
  order?: number;
}

interface UseAppWidgetsReturn {
  widgets: Readonly<Ref<AppWidget[]>>;
  register: (widget: AppWidget) => void;
  unregister: (id: string) => void;
}

/**
 * Registry of framed widgets rendered by the DMS in the page dock. See
 * {@link AppWidget} for the contract and {@link useAppOverlay} for the free,
 * self-positioned alternative.
 */
export const useAppWidgets = (): UseAppWidgetsReturn => {
  const widgets = useDmsState<AppWidget[]>("dms-app-widgets", () => []);

  function register(widget: AppWidget): void {
    const next = widgets.value.filter((entry) => entry.id !== widget.id);
    next.push(widget);
    next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    widgets.value = next;
  }

  function unregister(id: string): void {
    widgets.value = widgets.value.filter((entry) => entry.id !== id);
  }

  return { widgets, register, unregister };
};
