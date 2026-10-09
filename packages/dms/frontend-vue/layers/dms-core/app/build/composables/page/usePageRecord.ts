import { computed } from "vue";

/** The record a page shows, as its header loaded it. */
interface PageRecordState {
  path: string;
  record: Record<string, unknown> | null;
  isLoading: boolean;
  hasError: boolean;
}

const STATE_KEY = "dms-page-record";

/**
 * The record a detail page is about, loaded by its header
 * (`DefaultLayout({ header: { fetchUrl } })`): the header's actions read
 * their `when` / `unavailableWhen` conditions on it, and so does an
 * `ActionList` with no `fetchUrl` of its own. Held with the page's path, so
 * it never outlives its page; a page whose header loads nothing has none.
 */
export function usePageRecord() {
  const state = useDmsState<PageRecordState | null>(STATE_KEY, () => null);
  const route = useDmsRoute();

  const current = computed(() =>
    state.value && state.value.path === route.path ? state.value : null,
  );

  /** Whether the page's header loads a record at all. */
  const hasSource = computed(() => current.value !== null);
  const record = computed(() => current.value?.record ?? null);
  const isLoading = computed(() => current.value?.isLoading ?? false);
  const hasError = computed(() => current.value?.hasError ?? false);

  /** Publishes the record of the page at `path`, or its loading state. */
  const setRecord = (path: string, next: Omit<PageRecordState, "path">) => {
    state.value = { path, ...next };
  };

  return { hasSource, record, isLoading, hasError, setRecord };
}
