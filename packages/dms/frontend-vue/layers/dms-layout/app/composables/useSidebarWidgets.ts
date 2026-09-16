/**
 * Where a {@link SidebarWidget} is mounted, independently of the module it is
 * scoped to:
 *
 * - `ABOVE_SEARCH_BAR` — between the logo and the search button.
 * - `BELOW_SEARCH_BAR` — under the search button, and under the module title
 *   card as well while browsing inside a module.
 */
export const SidebarWidgetPosition = {
  ABOVE_SEARCH_BAR: "above-search-bar",
  BELOW_SEARCH_BAR: "below-search-bar",
} as const;

export type SidebarWidgetPosition =
  (typeof SidebarWidgetPosition)[keyof typeof SidebarWidgetPosition];

/**
 * A free component rendered in the sidebar. Unlike a framed {@link AppWidget},
 * the DMS adds no chrome: the component is mounted as-is, stacked with the
 * other sidebar widgets in `order`, and receives the sidebar's `collapsed`
 * state as a boolean prop so it can adapt to the narrow rail (components that
 * don't care can ignore it).
 *
 * Placement and visibility are two independent axes. `position` says where the
 * widget lands in the sidebar; `module` says when it renders at all — a global
 * widget (no `module`) is hidden while browsing inside a module, a
 * module-scoped one only shows inside its own module.
 *
 * Every field is serializable (no callables), so a widget can be registered
 * from a regular (SSR-safe) plugin. Module scoping is declarative via `module`; any
 * other conditional visibility is the widget's own responsibility: render
 * nothing when it has nothing to show, or `unregister` (both `register` and
 * `unregister` are idempotent / keyed by `id`).
 */
export interface SidebarWidget {
  /** Unique key: dedup on `register` (upsert) and target of `unregister`. */
  id: string;
  /**
   * Name of a global component mounted in the sidebar. It receives a
   * `collapsed: boolean` prop reflecting the sidebar's collapsed state.
   */
  component: string;
  /**
   * Where the widget is mounted, whether or not it is scoped to a module.
   * Defaults to the historical placement — `BELOW_SEARCH_BAR` for a
   * module-scoped widget, `ABOVE_SEARCH_BAR` otherwise — so widgets written
   * before the field existed keep their spot.
   */
  position?: SidebarWidgetPosition;
  /**
   * Stack order, ascending from the top, among the widgets sharing the same
   * effective `position` — widgets sitting at different positions render at
   * different spots, so `order` cannot interleave them. Defaults to `0`.
   *
   * Ties are broken by the widget's current index in the registry, not by when
   * it was registered: re-registering an id updates it in place and keeps its
   * index — even when the new `order` moves it to a different tie group — and
   * `unregister` followed by `register` sends it to the end. Give tied widgets
   * distinct `order` values when the stack has to be deterministic.
   */
  order?: number;
  /**
   * Only render while browsing inside this module (`/modules/<id>/**`). Absent
   * means the global sidebar only: an unscoped widget is hidden while browsing
   * inside any module. Either way the widget stays registered when out of
   * scope — it just never mounts — so a layer can register once at boot from a
   * universal plugin. An id that resolves to no installed module silently
   * never renders. Scoping only picks the default `position`; a widget that
   * declares one keeps it whether it is scoped or not.
   */
  module?: string;
}

interface UseSidebarWidgetsReturn {
  widgets: Readonly<Ref<SidebarWidget[]>>;
  register: (widget: SidebarWidget) => void;
  unregister: (id: string) => void;
}

const KNOWN_POSITIONS = new Set<string>(Object.values(SidebarWidgetPosition));

/**
 * Position a widget renders at. A widget that declares no `position` — or one
 * this DMS build doesn't know, which an older or untyped layer can still
 * register — falls back to the placement used before `position` existed, so it
 * always lands somewhere rather than silently vanishing.
 */
export const resolveSidebarWidgetPosition = (
  widget: SidebarWidget,
): SidebarWidgetPosition => {
  if (widget.position && KNOWN_POSITIONS.has(widget.position)) {
    return widget.position;
  }
  return widget.module
    ? SidebarWidgetPosition.BELOW_SEARCH_BAR
    : SidebarWidgetPosition.ABOVE_SEARCH_BAR;
};

/**
 * Whether a widget renders while browsing the given module.
 *
 * The two axes are independent: this one answers *when*, the position answers
 * *where*. A global widget (no `module`) shows only outside modules, and a
 * scoped one only inside its own — an exact match either way, so a widget
 * scoped to one module can never appear in another.
 *
 * @param widget Widget being considered
 * @param currentModuleId Module being browsed; `null` or `undefined` outside
 *   any module — the sidebar passes an optional chain, so both reach here
 */
export const isSidebarWidgetVisible = (
  widget: SidebarWidget,
  currentModuleId: string | null | undefined,
): boolean => (widget.module ?? null) === (currentModuleId ?? null);

/**
 * Registry of free components rendered by the DMS in the sidebar — above or
 * below the search button, as each widget declares. See {@link SidebarWidget}
 * for the contract and {@link useAppWidgets} for the framed page-dock
 * alternative.
 */
export const useSidebarWidgets = (): UseSidebarWidgetsReturn => {
  const widgets = useDmsState<SidebarWidget[]>("dms-sidebar-widgets", () => []);

  function register(widget: SidebarWidget): void {
    // Re-registering upserts in place, so a widget swapping its component
    // keeps its rank among the widgets sharing its order.
    const known = widgets.value.findIndex((entry) => entry.id === widget.id);
    const next = [...widgets.value];
    if (known === -1) {
      next.push(widget);
    } else {
      next[known] = widget;
    }
    next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    widgets.value = next;
  }

  function unregister(id: string): void {
    widgets.value = widgets.value.filter((entry) => entry.id !== id);
  }

  return { widgets, register, unregister };
};
