import type { DropdownMenuItem } from "@nuxt/ui";

export const createMenuItem = (
  label: string,
  icon: string,
  onSelect?: () => void,
  options?: Partial<DropdownMenuItem>,
): DropdownMenuItem => ({
  label,
  icon,
  onSelect,
  ...options,
});

export const createSeparator = (): DropdownMenuItem => ({
  type: "separator",
  label: "",
  icon: "",
});

export const createMenuItems = (
  ...items: (DropdownMenuItem | null)[]
): DropdownMenuItem[] => {
  return items.filter((item): item is DropdownMenuItem => item !== null);
};
