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
  neutral: "bg-(--dms-neutral-tint) text-muted",
};
