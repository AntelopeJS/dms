import { computed, type WritableComputedRef, type ComputedRef } from "vue";
import { readQueryValue } from "../../utils/mockup";
import { RECORD_QUERY } from "../../utils/mockupLinks";
import { detach } from "../detach";

const PAGE_QUERY = "page";

/** The page the viewer shows, and the row it shows it on. */
export interface MockupRoutePage {
  /** The id of the page asked for, none for the Overview; setting it opens that page on no row. */
  page: WritableComputedRef<string | undefined>;
  /** The row a link from a row passed the page. */
  record: ComputedRef<string | undefined>;
  /** Opens the page `id`, on the row `record` when a link names one; no `id` opens the Overview. */
  open: (id: string | undefined, record?: string) => void;
}

/**
 * The page on screen and its row as the URL's `?page=` and `?record=`: each
 * page opened, and each return to the Overview, is a new entry of the
 * browser's history, so back and forward step through them.
 */
export function useMockupRoutePage(): MockupRoutePage {
  const route = useDmsRoute();
  const router = useDmsRouter();

  function open(id: string | undefined, record?: string): void {
    const kept = Object.fromEntries(
      Object.entries(route.query).filter(
        ([key]) => key !== PAGE_QUERY && key !== RECORD_QUERY,
      ),
    );
    detach(
      router.push({
        query: {
          ...kept,
          ...(id !== undefined && { [PAGE_QUERY]: id }),
          ...(record !== undefined && { [RECORD_QUERY]: record }),
        },
      }),
    );
  }

  return {
    page: computed({
      get: () => readQueryValue(route.query[PAGE_QUERY]),
      set: (id) => open(id),
    }),
    record: computed(() => readQueryValue(route.query[RECORD_QUERY])),
    open,
  };
}
