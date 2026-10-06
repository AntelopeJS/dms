import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ComputedRef, Ref } from "vue";
import type {
  TableViewListResponse,
  TableViewReorderConfig,
} from "../../../composables/table-view/types";
import type { TableReorder } from "../../components/table/Table.vue";
import { moveRow, reorderEdits } from "./utils/reorder";

export interface TableReorderOptions<T> {
  reorder: TableViewReorderConfig | undefined;
  /** The page listed; a move updates it in place. */
  data: Ref<TableViewListResponse<T> | null | undefined>;
  rowIdKey: string;
  location: string;
  api: ReturnType<typeof $fetch.create>;
  /** The caller may edit rows. */
  canEdit: ComputedRef<boolean>;
  /** A search, a filter or a tab narrows the rows. */
  isNarrowed: ComputedRef<boolean>;
  /** The grid is the display shown. */
  isGrid: ComputedRef<boolean>;
  /** Lists the rows again, after a move failed. */
  refresh: () => Promise<void> | void;
  onError: (error: unknown) => void;
}

/**
 * Rows ordered by hand: a move updates the page at once and saves, by a
 * partial edit, only the rows whose position changed. Moving is off while
 * the rows are narrowed (the handle says how to turn it back on); outside
 * the grid, or for a caller who may not edit, there is no handle at all.
 */
export function useTableReorder<T>(options: TableReorderOptions<T>) {
  const { reorder, data, rowIdKey } = options;

  const save = (edits: { id: string; value: number }[]) =>
    Promise.all(
      edits.map(({ id, value }) =>
        options.api(`${options.location}/edit`, {
          method: "PUT",
          query: { id },
          body: { [reorder!.field]: value },
        }),
      ),
    );

  const move = async (from: number, to: number) => {
    const page = data.value;
    if (!reorder || !page || from === to) return;
    const moved = moveRow(page.results, from, to);
    const edits = reorderEdits(moved, to, reorder.field, rowIdKey);
    const values = new Map(edits.map((edit) => [edit.id, edit.value]));
    data.value = {
      ...page,
      results: moved.map((row) => {
        const value = values.get(String(get(row as never, rowIdKey)));
        return value === undefined ? row : { ...row, [reorder.field]: value };
      }),
    };
    try {
      await save(edits);
    } catch (error) {
      options.onError(error);
      await options.refresh();
    }
  };

  const state = computed<TableReorder | undefined>(() => {
    if (!reorder || !options.isGrid.value || !options.canEdit.value) {
      return undefined;
    }
    return { enabled: !options.isNarrowed.value, move };
  });

  return { reorderState: state };
}
