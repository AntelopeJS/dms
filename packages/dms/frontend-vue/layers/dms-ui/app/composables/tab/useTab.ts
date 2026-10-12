/**
 * The index of the tab a URL names: its slot (`?tab=tester`), or its index
 * (`?tab=2`) as written before tabs were named. `null` when it names none.
 */
function tabIndexOf(
  value: unknown,
  slots: readonly string[],
  tabCount: number,
): number | null {
  if (typeof value !== "string" || value === "") return null;
  const bySlot = slots.indexOf(value);
  if (bySlot >= 0) return bySlot;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < tabCount
    ? index
    : null;
}

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
  const slots = computed(() => (props.items ?? []).map((item) => item.slot));

  const urlTabIndex = (value: unknown) =>
    tabIndexOf(value, slots.value, totalTabs.value);

  const getInitialTab = () => {
    const fromUrl = props.persistState
      ? urlTabIndex(route.query[stateKey])
      : null;
    return String(fromUrl ?? 0);
  };

  const activeTab = ref<string>(getInitialTab());

  // The open tab is written by its slot, which stays right when tabs are
  // added or reordered; a tab without one keeps its index.
  const updateUrl = async (newTab: string) => {
    if (!props.persistState) return;

    const query = { ...route.query };
    if (newTab === "0") {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete query[stateKey];
    } else {
      query[stateKey] = slots.value[Number(newTab)] || newTab;
    }
    await router.push({ query });
  };

  const goToTab = (index: number | string) => {
    const indexNum = isString(index)
      ? (tabIndexOf(index, slots.value, totalTabs.value) ?? -1)
      : index;
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
    if (newTab === oldTab) return;
    if (props.componentId) {
      sendComponentEvent(TabEvents.TAB_CHANGE, props.componentId, {
        previousTab: Number.parseInt(oldTab, 10),
        currentTab: Number.parseInt(newTab, 10),
      });
    }
    await updateUrl(newTab);
  });

  watch(
    () => route.query[stateKey],
    (newValue) => {
      if (!props.persistState) return;

      const tabIndex = urlTabIndex(newValue);
      if (tabIndex !== null && String(tabIndex) !== activeTab.value) {
        activeTab.value = String(tabIndex);
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
