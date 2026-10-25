import type { BlockText } from "#dms-core/app/types/composed-text";
import type { MatrixColumn, MatrixRow } from "../../../types/matrix";
import type { RowNavigation } from "../../../types/row-navigation";
import type { DrawerInstance } from "../../../composables/containers/types";
import MatrixCellDrawer from "../../components/matrix/MatrixCellDrawer.vue";
import MatrixRowDrawer from "../../components/matrix/MatrixRowDrawer.vue";
import type { MatrixCellAddress } from "./matrixNavigation";
import type { MatrixEditing } from "./useMatrixInteraction";

/** What the drawers need of the grid. */
export interface MatrixDrawersOptions {
  /** Handed to the drawer bodies: they read and edit through it. */
  context: () => unknown;
  componentId: string;
  shownRows: () => MatrixRow[];
  rowOf: (rowId: string) => MatrixRow | undefined;
  columnOf: (columnId: string) => MatrixColumn | undefined;
  text: (text: BlockText | undefined) => string;
  rowTitle: (row: MatrixRow) => string;
  panelTitle: () => BlockText | undefined;
  /** Gives the keyboard back to the grid's cell once a drawer closes. */
  onClosed: (address?: MatrixCellAddress) => void;
}

const ROW_POSITION_KEY = "$dms.matrix.drawer.row_position";

/**
 * The grid's drawers: one cell's editor alone (a JSON value, a long text),
 * and a whole row as a form, J and K stepping through the rows shown.
 */
export function useMatrixDrawers(options: MatrixDrawersOptions) {
  const { open } = useDrawer();
  let rowDrawer: DrawerInstance | null = null;

  function openCellDrawer(
    address: MatrixCellAddress,
    editing?: MatrixEditing,
  ): void {
    const row = options.rowOf(address.rowId);
    const column = options.columnOf(address.columnId);
    if (!row || !column) return;
    const drawer = open({
      direction: "right",
      title: options.text(column.label),
      description: options.rowTitle(row),
      icon: column.icon,
      component: MatrixCellDrawer,
      sizeKey: `dms-matrix-cell-${options.componentId}`,
      componentOptions: {
        context: options.context(),
        rowId: row.id,
        columnId: column.id,
        draft: editing?.draft,
        hasDraft: editing?.hasDraft ?? false,
        isModel: editing?.isModel ?? false,
      },
    });
    drawer.result.finally(() => options.onClosed(address));
  }

  function navigationOf(index: number): RowNavigation {
    const rows = options.shownRows();
    return {
      index,
      total: rows.length,
      hasPrev: index > 0,
      hasNext: index < rows.length - 1,
      prev: () => showRow(index - 1),
      next: () => showRow(index + 1),
    };
  }

  function rowDrawerOptions(row: MatrixRow) {
    const index = options.shownRows().findIndex((entry) => entry.id === row.id);
    const title = options.rowTitle(row);
    return {
      title,
      componentKey: row.id,
      rowHeader: {
        title,
        positionLabel: ROW_POSITION_KEY,
        subtitle: options.panelTitle()
          ? options.text(options.panelTitle())
          : undefined,
        ...(index >= 0 && { navigation: navigationOf(index) }),
      },
      componentOptions: { context: options.context(), rowId: row.id },
    };
  }

  function showRow(index: number): void {
    const row = options.shownRows()[index];
    if (row && rowDrawer) rowDrawer.patch(rowDrawerOptions(row));
  }

  function openRowPanel(rowId: string): void {
    const row = options.rowOf(rowId);
    if (!row) return;
    if (rowDrawer) {
      rowDrawer.patch(rowDrawerOptions(row));
      return;
    }
    rowDrawer = open({
      direction: "right",
      component: MatrixRowDrawer,
      sizeKey: `dms-matrix-row-${options.componentId}`,
      ...rowDrawerOptions(row),
    });
    rowDrawer.result.finally(() => {
      rowDrawer = null;
      options.onClosed();
    });
  }

  return { openCellDrawer, openRowPanel };
}
