export interface UseTabReturn {
  activeTab: Ref<string>;
  nextTab: () => void;
  previousTab: () => void;
  goToTab: (index: number | string) => void;
  goToFirstTab: () => void;
  goToLastTab: () => void;
  resetTabs: () => void;
  loading: Ref<boolean>;
  watchState: Ref<Record<string, unknown>>;
}
