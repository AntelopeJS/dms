import type { useWatch } from "#dms-core/app/composables/watch/useWatch";

export interface UseTabReturn {
  activeTab: Ref<string>;
  nextTab: () => void;
  previousTab: () => void;
  /** Opens a tab by its index, or by its slot (`"tester"`). */
  goToTab: (index: number | string) => void;
  goToFirstTab: () => void;
  goToLastTab: () => void;
  resetTabs: () => void;
  loading: Ref<boolean>;
  watchState: ReturnType<typeof useWatch>["state"];
}
