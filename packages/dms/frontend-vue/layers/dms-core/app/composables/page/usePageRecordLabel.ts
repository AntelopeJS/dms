import { computed, type ComputedRef } from "vue";

interface StoredRecordLabel {
  path: string;
  label: string;
}

const STATE_KEY = "dms-page-record-label";

/** The label of the record a page is about (see {@link usePageRecordLabel}). */
export interface PageRecordLabel {
  /** The label of the page on screen, `undefined` when none was set for it. */
  label: ComputedRef<string | undefined>;
  /**
   * Names the record of the page at `path` (the current one is
   * `useDmsRoute().path`); `undefined` or `""` clears it.
   */
  setLabel: (path: string, value: string | undefined) => void;
}

/**
 * The label of the record a page is about, e.g. the task an edit page
 * changes: the page header ends its breadcrumb with it, after the page's own
 * name. A `Form` with `labelKey` sets it once it loaded its record; a module's
 * own component on a record page sets it the same way, and may read it.
 *
 * The label is held with the path it was set for, so it never outlives its
 * page: on another page `label` reads `undefined` until that page sets one.
 * Shared state, so the server-rendered header shows it too when it is set
 * during the render.
 *
 * ```ts
 * const route = useDmsRoute();
 * const { setLabel } = usePageRecordLabel();
 * watch(routeName, (name) => setLabel(route.path, name), { immediate: true });
 * ```
 */
export function usePageRecordLabel(): PageRecordLabel {
  const state = useDmsState<StoredRecordLabel | null>(STATE_KEY, () => null);
  const route = useDmsRoute();

  const label = computed(() =>
    state.value && state.value.path === route.path
      ? state.value.label
      : undefined,
  );

  const setLabel = (path: string, value: string | undefined) => {
    state.value = value ? { path, label: value } : null;
  };

  return { label, setLabel };
}
