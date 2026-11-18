import type { MatrixColumn } from "../../../types/matrix";
import type { EditorValueResult } from "./matrixValues";

type InvalidResult = Extract<EditorValueResult, { ok: false }>;

/** Why a draft is refused, in words: "At least 0", "Invalid JSON — …". */
export function useMatrixInvalidText() {
  const { t } = useI18n();
  return (column: MatrixColumn, result: InvalidResult): string => {
    const message = t(`dms.matrix.invalid.${result.reason}`, {
      min: column.min,
      max: column.max,
    });
    return result.detail ? `${message} — ${result.detail}` : message;
  };
}
