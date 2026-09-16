import type { AvatarProps, BadgeProps } from "@nuxt/ui";

export interface TabItem {
  label: string;
  slot: string;
  icon?: string;
  badge?: string | number | BadgeProps;
  disabled?: boolean;
  shortcut?: string;
  avatar?: AvatarProps;
}
