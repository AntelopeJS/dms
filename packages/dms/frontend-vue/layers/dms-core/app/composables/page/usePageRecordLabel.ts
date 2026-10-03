import { computed } from "vue";

interface PageRecordLabel {
  path: string;
  label: string;
}

const STATE_KEY = "dms-page-record-label";

/**
 * The label of the row a page is about, e.g. the task an edit page changes:
 * the form that loads the row sets it, the breadcrumb ends with it. Held with
 * the page's path, so it never outlives its page.
 */
export function usePageRecordLabel() {
  const state = useDmsState<PageRecordLabel | null>(STATE_KEY, () => null);
  const route = useDmsRoute();

  const label = computed(() =>
    state.value && state.value.path === route.path
      ? state.value.label
      : undefined,
  );

  /** Names the row of the page at `path`; no label clears it. */
  const setLabel = (path: string, value: string | undefined) => {
    state.value = value ? { path, label: value } : null;
  };

  return { label, setLabel };
}
