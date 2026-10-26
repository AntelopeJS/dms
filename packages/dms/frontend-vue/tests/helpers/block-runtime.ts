import * as vue from "vue";
import { vi } from "vitest";
import { engine, stubApiData } from "./api-data-runtime";
import { useWatch } from "../../layers/dms-core/app/composables/watch/useWatch";
import { useComponentEvent } from "../../layers/dms-core/app/composables/components/useComponentEvent";
import { useSessionRecovery } from "../../layers/dms-core/app/composables/auth/useSessionRecovery";
import { useTranslation } from "../../layers/dms-core/app/composables/translation/useTranslation";
import { useTab } from "../../layers/dms-ui/app/composables/tab/useTab";
import { useTabShortcuts } from "../../layers/dms-ui/app/composables/tab/shortcuts/useTabShortcuts";
import { Events } from "../../layers/dms-core/app/types/component";
import { TabEvents } from "../../layers/dms-ui/app/composables/tab/types/events";
import { isNumber, isString } from "../../layers/dms-core/app/utils/type-check";

export async function stubBlockRuntime(
  authFetch: Parameters<typeof stubApiData>[0],
): Promise<void> {
  for (const name of [
    "computed",
    "ref",
    "watch",
    "onMounted",
    "onUnmounted",
    "onBeforeUnmount",
    "onScopeDispose",
    "toValue",
    "useTemplateRef",
  ] as const) {
    vi.stubGlobal(name, vue[name]);
  }
  const { useDefinedFunctions } = await import(
    "../../layers/dms-core/app/composables/functions/useDefinedFunction"
  );
  const autoImports = {
    useWatch,
    useDefinedFunctions,
    useComponentEvent,
    useSessionRecovery,
    useTranslation,
    useTab,
    useTabShortcuts,
    Events,
    TabEvents,
    isNumber,
    isString,
    useDmsRoute: engine.useDmsRoute,
    useDmsRouter: engine.useDmsRouter,
    useDmsApp: engine.useDmsApp,
    useDmsUserSession: engine.useDmsUserSession,
    useDmsCookie: engine.useDmsCookie,
  };
  for (const [name, value] of Object.entries(autoImports))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: "http://localhost" } },
  }));
  vi.stubGlobal("defineShortcuts", () => {});
  stubApiData(authFetch);
}
