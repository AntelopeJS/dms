import type { SemanticColor } from "./semanticTint";

/** The tones a banner washes with. */
export type BannerTone = Exclude<SemanticColor, "neutral">;

/** The icon a banner shows for its tone when it is given none. */
export const BANNER_TONE_ICONS: Record<BannerTone, string> = {
  info: "i-ph-info",
  success: "i-ph-check-circle",
  warning: "i-ph-warning",
  error: "i-ph-warning-circle",
  primary: "i-ph-sparkle",
};
