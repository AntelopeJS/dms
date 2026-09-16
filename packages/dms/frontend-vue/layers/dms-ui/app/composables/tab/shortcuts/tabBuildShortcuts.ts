import type { TabItem } from "../types";

export function buildTabShortcuts(
  items: TabItem[],
  goToTab: (index: number) => void,
): Record<string, () => void> {
  const shortcuts: Record<string, () => void> = {};

  items.forEach((item, index) => {
    if (item.shortcut) {
      shortcuts[`shift_${item.shortcut.toLowerCase()}`] = () => goToTab(index);
    }
  });

  return shortcuts;
}
