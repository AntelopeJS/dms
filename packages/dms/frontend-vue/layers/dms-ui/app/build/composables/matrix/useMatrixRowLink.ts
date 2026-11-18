import { onMounted, watch } from "vue";
import type { MatrixRow } from "../../../types/matrix";
import {
  matrixRowUrlKey,
  readMatrixUrlRow,
  writeMatrixUrlEntries,
} from "./matrixUrlState";

/** What keeping a grid's open row in the URL reads. */
export interface MatrixRowLinkSetup {
  componentId: string;
  /** `rowPanel.deepLink`: the URL names the row the drawer has open. */
  isDeepLinked: boolean;
  rowById: () => ReadonlyMap<string, MatrixRow>;
  isLoading: () => boolean;
  hasData: () => boolean;
  openRowPanel: (rowId: string) => void;
}

/**
 * The row drawer kept in the URL (`rowPanel.deepLink`): the row the URL
 * names opens once it is read, a row the grid does not hold is taken out of
 * the URL, and each row the drawer shows is written back.
 */
export function useMatrixRowLink(setup: MatrixRowLinkSetup) {
  const key = matrixRowUrlKey(setup.componentId);
  let linkedRow = setup.isDeepLinked
    ? readMatrixUrlRow(useDmsRoute().query, setup.componentId)
    : undefined;
  onMounted(() => {
    if (!linkedRow) return;
    watch(
      [setup.rowById, setup.isLoading],
      ([byId, isLoading]) => {
        if (!linkedRow) return;
        const rowId = linkedRow;
        if (byId.has(rowId)) {
          linkedRow = undefined;
          setup.openRowPanel(rowId);
          return;
        }
        if (isLoading || !setup.hasData()) return;
        linkedRow = undefined;
        writeMatrixUrlEntries({ [key]: undefined });
      },
      { immediate: true },
    );
  });
  return {
    /** The row the drawer shows now, `undefined` once it closed. */
    onRowShown: (rowId?: string) => {
      if (setup.isDeepLinked) writeMatrixUrlEntries({ [key]: rowId });
    },
  };
}
