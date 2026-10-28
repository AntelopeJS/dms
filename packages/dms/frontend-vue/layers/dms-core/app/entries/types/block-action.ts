import type { ButtonProps } from "@nuxt/ui";
import type { Tone } from "../../types/tone";

/** A link button a block option declares (interface-dms `BlockLinkAction`). */
export interface BlockAction {
  label: string;
  /** Route, `#anchor` or URL; an absolute URL opens in a new tab. */
  to: string;
  icon?: string;
  variant?: ButtonProps["variant"];
  color?: Tone;
}
