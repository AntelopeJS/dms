import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useTab } from "../layers/dms-ui/app/composables/tab/useTab";
import { TabEvents } from "../layers/dms-ui/app/composables/tab/types/events";
import { isNumber, isString } from "../layers/dms-core/app/utils/type-check";

const TAB_COUNT = 3;
const sendComponentEvent = vi.fn();

beforeEach(() => {
  sendComponentEvent.mockClear();
  Object.entries({ computed, ref, watch, TabEvents }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("isNumber", isNumber);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent }));
  vi.stubGlobal("useWatch", () => ({ isLoading: ref(false), state: ref({}) }));
  vi.stubGlobal("useDmsRoute", () => reactive({ query: {} }));
  vi.stubGlobal("useDmsRouter", () => ({ push: vi.fn() }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("switches tabs without announcing them when no component owns the set", async () => {
  const { activeTab, goToTab } = useTab(TAB_COUNT, { items: [] });

  goToTab(1);
  await nextTick();

  expect(activeTab.value).toBe("1");
  expect(sendComponentEvent).not.toHaveBeenCalled();
});

it("announces a tab change for a registered component", async () => {
  const { goToTab } = useTab(TAB_COUNT, {
    items: [],
    componentId: "settings.tabs",
    pageId: "settings",
  });

  goToTab(2);
  await nextTick();

  expect(sendComponentEvent).toHaveBeenCalledWith(
    TabEvents.TAB_CHANGE,
    "settings.tabs",
    { previousTab: 0, currentTab: 2 },
  );
});
