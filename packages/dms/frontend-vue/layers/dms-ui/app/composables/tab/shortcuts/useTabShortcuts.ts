import { buildTabShortcuts } from "./tabBuildShortcuts";

interface UseTabShortcutsParams {
  items: TabItem[];
  goToTab: (index: number) => void;
}

export function useTabShortcuts({
  items,
  goToTab,
}: UseTabShortcutsParams): void {
  const shortcuts = buildTabShortcuts(items, goToTab);
  defineShortcuts(shortcuts);
}
