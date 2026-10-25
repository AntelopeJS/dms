import type { MatrixAlign, MatrixTone } from "../../../types/matrix";

/**
 * The tint each tone lays on a cell or a row, a DMS token in both themes.
 * Laid as a background image over the cell's own colour (see
 * `MATRIX_TINT_CLASS`), so a sticky cell stays opaque under its tint.
 */
export const MATRIX_TONE_TINTS: Record<MatrixTone, string> = {
  neutral: "var(--dms-neutral-tint)",
  primary: "var(--dms-accent-tint)",
  success: "var(--dms-success-tint)",
  warning: "var(--dms-warning-tint)",
  error: "var(--dms-error-tint)",
  info: "var(--dms-info-tint)",
};

/** The ink of a cell in a tone (a value under its minimum reads red). */
export const MATRIX_TONE_TEXT: Record<MatrixTone, string> = {
  neutral: "text-muted",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error font-semibold",
  info: "text-info",
};

/** The bar a toned row header carries on its leading edge. */
export const MATRIX_TONE_BAR: Record<MatrixTone, string> = {
  neutral: "shadow-[inset_2px_0_0_0_var(--ui-border-accented)]",
  primary: "shadow-[inset_2px_0_0_0_var(--ui-primary)]",
  success: "shadow-[inset_2px_0_0_0_var(--ui-success)]",
  warning: "shadow-[inset_2px_0_0_0_var(--ui-warning)]",
  error: "shadow-[inset_2px_0_0_0_var(--ui-error)]",
  info: "shadow-[inset_2px_0_0_0_var(--ui-info)]",
};

/** Paints `--dms-matrix-tint` over the cell's background. */
export const MATRIX_TINT_CLASS =
  "bg-[image:linear-gradient(var(--dms-matrix-tint),var(--dms-matrix-tint))]";

/** The diagonal hatching of a disabled cell (and of its legend swatch). */
export const MATRIX_HATCH_CLASS =
  "bg-[image:repeating-linear-gradient(-45deg,var(--ui-border-accented)_0_1px,transparent_1px_7px)]";

export const MATRIX_ALIGN_CLASSES: Record<MatrixAlign, string> = {
  start: "justify-start text-start",
  center: "justify-center text-center",
  end: "justify-end text-end",
};

/** The style giving a cell a tint, or none. */
export function tintStyle(
  tint: string | undefined,
): Record<string, string> | undefined {
  return tint ? { "--dms-matrix-tint": tint } : undefined;
}
