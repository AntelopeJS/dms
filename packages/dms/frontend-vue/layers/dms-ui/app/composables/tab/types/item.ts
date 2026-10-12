import type { AvatarProps, BadgeProps } from "@nuxt/ui";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";

export interface TabItem {
  label: string;
  /** The tab's id: its panel's slot, and its name in the URL (`?tab=<slot>`). */
  slot: string;
  icon?: string;
  /**
   * A count or a short word after the label: a `$` i18n key or a
   * `ComposedText` is written in the reader's language, as is the `label`
   * of a `BadgeProps`.
   */
  badge?: BlockText | number | BadgeProps;
  disabled?: boolean;
  shortcut?: string;
  avatar?: AvatarProps;
}
