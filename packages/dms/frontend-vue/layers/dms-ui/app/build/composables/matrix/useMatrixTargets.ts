import { computed, watch } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  MatrixOptions,
  MatrixRow,
  MatrixValue,
} from "../../../types/matrix";
import { detach } from "../detach";
import type { MatrixSaveEngine } from "./matrixSaveEngine";
import type { MatrixSection } from "./matrixSections";
import {
  computeMatrixTotals,
  matrixTargetMisses,
  mergeMatrixTargets,
} from "./matrixTotals";
import type { MatrixColumnsControls } from "./useMatrixColumns";
import type { MatrixDataSource } from "./useMatrixData";
import type { MatrixRowsControls } from "./useMatrixRows";

/** What the totals and targets of a grid read. */
export interface MatrixTargetsSetup {
  options: MatrixOptions;
  source: MatrixDataSource;
  rows: MatrixRowsControls;
  columns: MatrixColumnsControls;
  valueOf: (row: MatrixRow, columnId: string) => MatrixValue | undefined;
  text: (text: BlockText | undefined) => string;
  engine: MatrixSaveEngine;
}

/**
 * The grid's totals and the targets they must meet: the block's with the
 * route's, which ones are missed, and whether a `blockSave` target holds the
 * writes. Held writes go once every target is met again.
 */
export function useMatrixTargets(setup: MatrixTargetsSetup) {
  const { options, source, rows, columns, valueOf, engine } = setup;
  const { t } = useI18n();
  const targets = computed(() =>
    mergeMatrixTargets(options.targets, source.data.value?.targets),
  );
  const sectionTotals = (section: MatrixSection) =>
    computeMatrixTotals(section.rows, columns.columns.value, valueOf);
  const totals = computed(() =>
    computeMatrixTotals(rows.rows.value, columns.columns.value, valueOf),
  );
  const misses = computed(() =>
    matrixTargetMisses(targets.value, totals.value),
  );
  const isBlocked = computed(
    () => Boolean(targets.value?.blockSave) && misses.value.isMissed,
  );
  const targetMessage = computed(() => {
    if (!misses.value.isMissed) return null;
    return targets.value?.message
      ? setup.text(targets.value.message)
      : t("dms.matrix.target_missed");
  });
  watch(isBlocked, (blocked) => {
    if (!blocked && engine.heldCount.value > 0) detach(engine.flush());
  });
  return { targets, totals, sectionTotals, misses, isBlocked, targetMessage };
}
