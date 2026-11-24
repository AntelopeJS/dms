import * as vue from "vue";
import * as vueuse from "@vueuse/core";
import { tv } from "tailwind-variants";
import { vi } from "vitest";
import { stubBlockRuntime } from "./block-runtime";
import { stubMiscActions } from "./misc-runtime";
import { engine, mountInBrowser } from "./api-data-runtime";
import * as displays from "../../layers/dms-ui/app/composables/table-view/useTableViewDisplays";
import { usePreferences } from "../../layers/dms-core/app/composables/user/usePreferences";
import { useDataTypes } from "../../layers/dms-core/app/composables/data-types/useDataType";
import { useTableViewExport } from "../../layers/dms-ui/app/composables/table-view/useTableViewExport";
import { useSiteLayout } from "../../layers/dms-core/app/composables/page/useSiteLayout";
import { usePresenceEditWarning } from "../../layers/dms-ui/app/composables/confirm/usePresenceEditWarning";
import { useRealtimeTopic } from "../../layers/dms-core/app/composables/realtime/useRealtimeTopic";
import { useEventedAction } from "../../layers/dms-core/app/composables/useEventedAction";
import * as rowRules from "../../layers/dms-core/app/utils/row-action-rule-evaluator";
import { ButtonVariant } from "../../layers/dms-core/app/types/button";
import { Size } from "../../layers/dms-core/app/types/size";
import { SortDirection } from "../../layers/dms-ui/app/types/table/query";
import { resolveApiErrorMessage } from "../../layers/dms-core/app/composables/resolveApiError";
import * as typeChecks from "../../layers/dms-core/app/utils/type-check";
import * as formatters from "../../layers/dms-core/app/utils/formatter";
import type { Data } from "../../layers/dms-ui/app/types/table/base";
import type { TableViewConfig } from "../../layers/dms-ui/app/composables/table-view/types";
import type { TableViewLiveHoldOptions } from "../../layers/dms-core/app/types/live";
import { TableViewEvents } from "../../layers/dms-ui/app/composables/table-view/types";
import { TableViewFunctions } from "../../layers/dms-ui/app/composables/table-view/types/functions";
import { FormFunctions } from "../../layers/dms-ui/app/composables/form/types/functions";

export async function settleTable() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vue.nextTick();
}

export async function tableViewRuntime(
  fetch: Parameters<typeof stubBlockRuntime>[0],
) {
  stubMiscActions();
  await stubBlockRuntime(fetch);
  const globals = {
    ...vue,
    ...vueuse,
    ...displays,
    ...rowRules,
    ...typeChecks,
    ...formatters,
    defineDmsPlugin: engine.defineDmsPlugin,
    tv,
    ButtonVariant,
    Size,
    SortDirection,
    resolveApiErrorMessage,
    usePreferences,
    useDataTypes,
    useTableViewExport,
    useSiteLayout,
    usePresenceEditWarning,
    useRealtimeTopic,
    useEventedAction,
    TableViewEvents,
    TableViewFunctions,
    FormFunctions,
  };
  for (const [name, value] of Object.entries(globals))
    vi.stubGlobal(name, value);
  const i18n = {
    t: (key: string) => key,
    te: () => false,
    locale: vue.ref("en-GB"),
  };
  const dmsApp = { $i18n: i18n };
  vi.stubGlobal("useDmsApp", () => dmsApp);
  vi.stubGlobal("useDmsAppConfig", () => ({ ui: { icons: {} } }));
  vi.stubGlobal("useI18n", () => i18n);
  vi.stubGlobal("resolveDmsComponent", () => undefined);
  await loadTableView();
}

/**
 * Imports TableView and its plugins once the globals they read are stubbed.
 * `tableViewRuntime` calls it so the cold transform of the component graph
 * runs in the setup hook, not inside the first test's timeout.
 */
async function loadTableView() {
  const { default: TableView } = await import(
    "../../layers/dms-ui/app/components/table-view/TableView.vue"
  );
  const { default: register } = await import(
    "../../layers/dms-ui/app/plugins/register"
  );
  const { default: registerDisplays } = await import(
    "../../layers/dms-ui/app/plugins/table-view-displays"
  );
  return { TableView, register, registerDisplays };
}

export async function mountTableView(
  overrides: Partial<TableViewConfig<Data>> & {
    liveHold?: TableViewLiveHoldOptions;
  } = {},
  prepare?: () => void,
) {
  const { TableView, register, registerDisplays } = await loadTableView();
  const config = {
    componentId: "orders",
    pageId: "sales",
    location: "/api/orders",
    formComponents: {},
    columns: [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        listable: true,
        enableSorting: true,
        type: {
          id: "string",
          compareModes: [],
          filterComponents: {},
          inputComponent: { componentName: "Input" },
        },
      },
      {
        id: "secret",
        accessorKey: "secret",
        header: "Secret",
        listable: true,
        enableSorting: false,
        type: {
          id: "string",
          compareModes: [],
          filterComponents: {},
          inputComponent: { componentName: "Input" },
        },
      },
    ],
    ...overrides,
  };
  const registrations: Array<ReturnType<typeof register>> = [];
  const generation = vue.ref(0);
  const mounted = mountInBrowser(
    vue.defineComponent({
      setup: () => () =>
        vue.h(
          vue.Suspense,
          { key: generation.value },
          { default: () => vue.h(TableView, config) },
        ),
    }),
    (app) =>
      app.runWithContext(() => {
        registrations.push(register(engine.useDmsApp()));
        registrations.push(registerDisplays(engine.useDmsApp()));
        prepare?.();
      }),
  );
  for (const registration of registrations) await registration;
  return {
    ...mounted,
    /** Unmounts the table view and mounts it again in the same app. */
    remount: () => {
      generation.value += 1;
    },
  };
}
