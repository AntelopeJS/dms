import type { MatrixAlign, MatrixTone } from "../../../types/matrix";

/**
 * The tint each tone lays on a cell or a row, a DMS token in both themes.
 * Laid as a background image over the cell's own colour (see
 * `cellBackground`), so a sticky cell stays opaque under its tint.
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

export const MATRIX_ALIGN_CLASSES: Record<MatrixAlign, string> = {
  start: "justify-start text-start",
  center: "justify-center text-center",
  end: "justify-end text-end",
};

/** The diagonal hatching of a disabled cell (and of its legend swatch). */
const HATCH_IMAGE =
  "repeating-linear-gradient(-45deg, var(--ui-border-accented) 0 1px, transparent 1px 7px)";

/** What is painted over a cell's own background. */
export interface MatrixCellPaint {
  /** A tone's tint (`MATRIX_TONE_TINTS`). */
  tint?: string;
  /** Hatched, as a disabled cell. */
  isHatched?: boolean;
}

/**
 * The style painting a cell: its hatching and its tint laid as background
 * images over its own colour, both at once, so a sticky cell stays opaque.
 */
export function cellBackground(
  paint: MatrixCellPaint,
): Record<string, string> | undefined {
  const layers = [
    paint.isHatched ? HATCH_IMAGE : "",
    paint.tint ? `linear-gradient(${paint.tint}, ${paint.tint})` : "",
  ].filter(Boolean);
  return layers.length ? { backgroundImage: layers.join(", ") } : undefined;
}
