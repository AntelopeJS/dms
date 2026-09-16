export function useTab(
  tabCount: Ref<number> | number,
  props: TabProps,
): UseTabReturn {
  const stateKey = props.stateKey || "tab";

  const { sendComponentEvent } = useComponentEvent(props.componentId);
  const { isLoading: loading, state: watchState } = useWatch(
    props.watchActions || [],
  );

  const route = useDmsRoute();
  const router = useDmsRouter();

  const totalTabs = computed(() =>
    isNumber(tabCount) ? tabCount : tabCount.value,
  );

  const getInitialTab = () => {
    if (props.persistState && route.query[stateKey]) {
      const tabFromUrl = route.query[stateKey] as string;
      const tabIndex = Number.parseInt(tabFromUrl, 10);
      if (
        !Number.isNaN(tabIndex) &&
        tabIndex >= 0 &&
        tabIndex < totalTabs.value
      ) {
        return tabFromUrl;
      }
    }
    return String(0);
  };

  const activeTab = ref<string>(getInitialTab());

  const updateUrl = async (newTab: string) => {
    if (!props.persistState) return;

    const query = { ...route.query };
    if (newTab === "0") {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete query[stateKey];
    } else {
      query[stateKey] = newTab;
    }
    await router.push({ query });
  };

  const goToTab = (index: number | string) => {
    const indexNum = isString(index) ? Number.parseInt(index, 10) : index;
    const indexStr = String(indexNum);

    if (indexNum < 0 || indexNum >= totalTabs.value) {
      return;
    }

    if (indexStr === activeTab.value) return;

    activeTab.value = indexStr;
  };

  const nextTab = () => {
    const currentIndex = Number.parseInt(activeTab.value, 10);
    const nextIndex = Math.min(currentIndex + 1, totalTabs.value - 1);
    goToTab(nextIndex);
  };

  const previousTab = () => {
    const currentIndex = Number.parseInt(activeTab.value, 10);
    const prevIndex = Math.max(currentIndex - 1, 0);
    goToTab(prevIndex);
  };

  const goToFirstTab = () => goToTab(0);
  const goToLastTab = () => goToTab(totalTabs.value - 1);

  const resetTabs = () => {
    activeTab.value = "0";
    updateUrl("0");
  };

  watch(activeTab, async (newTab, oldTab) => {
    if (newTab !== oldTab) {
      sendComponentEvent(TabEvents.TAB_CHANGE, props.componentId, {
        previousTab: Number.parseInt(oldTab, 10),
        currentTab: Number.parseInt(newTab, 10),
      });

      await updateUrl(newTab);
    }
  });

  watch(
    () => route.query[stateKey],
    (newValue) => {
      if (!props.persistState) return;

      const tabStr = newValue as string;
      const tabIndex = Number.parseInt(tabStr, 10);
      if (
        !Number.isNaN(tabIndex) &&
        tabIndex >= 0 &&
        tabIndex < totalTabs.value &&
        tabStr !== activeTab.value
      ) {
        activeTab.value = tabStr;
      }
    },
  );

  return {
    activeTab,
    nextTab,
    previousTab,
    goToTab,
    goToFirstTab,
    goToLastTab,
    resetTabs,
    loading,
    watchState,
  };
}
