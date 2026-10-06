import type { Ref } from "vue";
import {
  type InstantSave,
  useInstantSave,
} from "#dms-ui/app/build/composables/instant-save/useInstantSave";
import { useSidebarStartCollapsed } from "../../../../../composables/general/useSidebarStartCollapsed";
import { useAccessibilityPreferences } from "../../../../../composables/general/useAccessibilityPreferences";
import { useInstantSaveHeader } from "../../../../../composables/layout/useInstantSaveHeader";
import { injectPageHeaderActionsHost } from "../../../../../composables/layout/usePageHeaderActions";

function usePreferenceRefs() {
  const { reduceMotion, increaseContrast, underlineLinks } =
    useAccessibilityPreferences();
  return {
    colorMode: useColorModePreference(),
    interfaceScale: useInterfaceScale(),
    sidebarStartCollapsed: useSidebarStartCollapsed(),
    reduceMotion,
    increaseContrast,
    underlineLinks,
  };
}

type PreferenceRefs = ReturnType<typeof usePreferenceRefs>;

export type AppearancePreferences = {
  [K in keyof PreferenceRefs]: PreferenceRefs[K]["value"];
};

export type AppearanceKey = keyof AppearancePreferences;

export interface AppearanceSave {
  preferences: PreferenceRefs;
  pick: <K extends AppearanceKey>(key: K, value: AppearancePreferences[K]) => void;
}

// One save per page header: the Appearance page is a block per group, and
// they share it so the header pill states every pick once.
const savesByHeader = new WeakMap<object, AppearanceSave>();

function createAppearanceSave(): AppearanceSave {
  const preferences = usePreferenceRefs();
  // Every appearance preference is per device, kept in a cookie: writing the
  // cookie is the save.
  const instant: InstantSave<AppearancePreferences> =
    useInstantSave<AppearancePreferences>({
      read: (key) =>
        preferences[key].value as AppearancePreferences[typeof key],
      write: (key, value) => {
        (preferences[key] as Ref<AppearancePreferences[typeof key]>).value =
          value;
      },
      save: () => Promise.resolve(),
    });
  useInstantSaveHeader(() => instant.state.value);
  return {
    preferences,
    pick: (key, value) => instant.change(key, value),
  };
}

/**
 * The appearance preferences and their instant save, shared by the blocks of
 * the Appearance page.
 */
export function useAppearanceSave(): AppearanceSave {
  const host = injectPageHeaderActionsHost();
  const shared = host ? savesByHeader.get(host) : undefined;
  if (shared) return shared;
  const save = createAppearanceSave();
  if (host) savesByHeader.set(host, save);
  return save;
}
