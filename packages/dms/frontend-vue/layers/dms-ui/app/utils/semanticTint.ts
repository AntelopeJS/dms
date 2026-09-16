// Shared design-system semantic colors + the canonical "soft tint" surface
// (design *-bg ≈ 10% fill) used for icon bubbles, pills and status dots.
// Tailwind needs literal class strings, so the map is a static record rather
// than `bg-${c}/10` interpolation. Components with their own per-spec values
// (e.g. a 20% icon box or a bordered ring) keep those local.
export type SemanticColor =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "primary"
  | "neutral";

export const SOFT_TINT: Record<SemanticColor, string> = {
  success: "bg-success/10 text-success",
  error: "bg-error/10 text-error",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary",
  neutral: "bg-elevated text-muted",
};
