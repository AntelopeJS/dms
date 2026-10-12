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
  watchState: Ref<Record<string, unknown>>;
}
