import { ref, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormContainerType } from "../layers/dms-ui/app/entries/composables/table-view/types";
import { fetchClientMock } from "./fixtures/unusedApi";
import { navBadgeCount } from "../layers/dms-ui/app/entries/composables/table-view/utils/tableCounts";
import { nextExpandedRows } from "../layers/dms-ui/app/entries/composables/table-view/utils/expandedRows";
import { TableViewFunctions } from "../layers/dms-ui/app/composables/table-view/types/functions";
import { TableViewEvents } from "../layers/dms-ui/app/composables/table-view/types/events";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { Color } from "../layers/dms-core/app/types/color";
import { normalizeActionConfig } from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import type { ComponentEventData } from "../layers/dms-core/app/types/component";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { isNull, isObject } from "../layers/dms-core/app/utils/type-check";
import type { useModal } from "../layers/dms-ui/app/composables/containers/useModal";
import { rowGroupKey } from "../layers/dms-ui/app/entries/composables/table-view/utils/groupedRows";
import { defined } from "./helpers/defined";

vi.stubGlobal("ref", ref);
vi.stubGlobal("shallowRef", shallowRef);
const { useDefinedFunctions } = await import(
  "../layers/dms-core/app/composables/functions/useDefinedFunction"
);
const { useTableRowActions } = await import(
  "../layers/dms-ui/app/entries/composables/table-view/useTableViewRowActions"
);
const { registerDefaultFunctions } = await import(
  "../layers/dms-ui/app/entries/composables/table-view/registerDefaultFunctions"
);

describe("a row action", () => {
  const sendComponentEvent =
    vi.fn<
      (
        name: string,
        componentId: string,
        data?: ComponentEventData["data"],
      ) => void
    >();
  const openModal = vi.fn<ReturnType<typeof useModal>["open"]>();

  beforeEach(() => {
    sendComponentEvent.mockReset();
    openModal.mockReset();
    vi.stubGlobal("HttpMethod", HttpMethod);
    vi.stubGlobal("Color", Color);
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useApiErrorPresenter", () => ({ presentError: vi.fn() }));
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      locale: ref("en"),
    }));
    vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn() }));
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (value: string) => value,
    }));
    vi.stubGlobal("useModal", () => ({ open: openModal }));
    vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
    vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
    vi.stubGlobal("interpolateUrl", interpolateUrl);
    vi.stubGlobal("navigateDms", vi.fn());
    vi.stubGlobal("resolveDmsComponent", vi.fn());
    vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
    vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent }));
    vi.stubGlobal("useEventedAction", useEventedAction);
    vi.stubGlobal("normalizeActionConfig", normalizeActionConfig);
    vi.stubGlobal("getPluginI18n", () => ({
      i18n: { t: (key: string) => key },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ref", ref);
  });

  const rowActions = () =>
    useTableRowActions({
      api: fetchClientMock(),
      location: "/api/task",
      columns: [],
      componentId: "table",
      pageId: "tasks",
      formContainer: { type: FormContainerType.modal },
      formComponents: {
        view: {
          componentName: "DmsFormBlock",
          options: { componentId: "form", pageId: "tasks" },
        },
      },
    });

  const openedUrl = () => {
    const [options] = openModal.mock.calls[0] ?? [];
    return options?.componentOptions?.fetchUrl;
  };

  const errorPayloadOf = async (failure: JsonValue) => {
    openModal.mockImplementation(() => {
      throw failure;
    });
    await rowActions()
      .openRow({ _id: "t1" })
      ?.catch(() => undefined);
    const [, , payload] = defined(
      sendComponentEvent.mock.calls.find(
        ([event]) => event === TableViewEvents.ROW_CLICK_ERROR,
      ),
    );
    if (!isObject(payload) || isNull(payload))
      throw new Error("The row click error event carried no payload");
    return payload.error;
  };

  it("opens a row whose id is a number, as its text", async () => {
    await rowActions().openRow({ _id: 7 });
    expect(openedUrl()).toBe("/api/task/get?id=7&action=details");
  });

  it("falls back to the id field when the first one is no id", async () => {
    await rowActions().openRow({ _id: {}, id: "row-1" });
    expect(openedUrl()).toBe("/api/task/get?id=row-1&action=details");
  });

  it("opens nothing for a row with no usable id", () => {
    expect(rowActions().openRow({ _id: null })).toBeUndefined();
    expect(openModal).not.toHaveBeenCalled();
    expect(sendComponentEvent).not.toHaveBeenCalled();
  });

  it("tells listeners a failure with the body the server sent", async () => {
    const body = { message: "Refused", fields: ["name"] };
    expect(await errorPayloadOf({ data: body, message: "x" })).toBe(body);
  });

  it("tells listeners a failure with its message when it has no body", async () => {
    expect(await errorPayloadOf({ data: "", message: "Failed" })).toBe(
      "Failed",
    );
  });

  it("tells listeners no payload for a failure that is no error", async () => {
    expect(await errorPayloadOf(null)).toBeUndefined();
    expect(await errorPayloadOf("boom")).toBeUndefined();
  });
});

describe("string-keyed tables answer own keys only", () => {
  it("reads no count for a tab named like an Object.prototype member", () => {
    expect(navBadgeCount({}, "constructor", false)).toBeUndefined();
    expect(navBadgeCount({ constructor: 3 }, "constructor", false)).toBe(3);
  });

  it("opens a row named like an Object.prototype member in single mode", () => {
    expect(
      nextExpandedRows({ a: true }, { constructor: true, a: true }, [], true),
    ).toEqual({ constructor: true });
  });
});

describe("a group key is read from a date only", () => {
  it("files a boolean or a list under no day", () => {
    expect(rowGroupKey(true, "day", "en-GB")).toBe("");
    expect(rowGroupKey(["2024-05-01"], "day", "en-GB")).toBe("");
    expect(rowGroupKey("2024-05-01T10:00:00Z", "day", "en-GB")).toBe(
      "2024-05-01",
    );
  });
});

describe("the page form's success function", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const register = () => {
    const navigate = vi.fn(() => Promise.resolve());
    vi.stubGlobal("useDefinedFunctions", useDefinedFunctions);
    vi.stubGlobal("useDmsRoute", () => ({ query: {}, path: "/page" }));
    vi.stubGlobal("useSiteLayout", () => ({
      findMatchingRoute: () => undefined,
    }));
    vi.stubGlobal("navigateDms", navigate);
    vi.stubGlobal("TableViewFunctions", TableViewFunctions);
    registerDefaultFunctions();
    const run = useDefinedFunctions().getFunction(
      "DmsComponent.TableView.CustomPageFormSuccess",
    );
    return { navigate, run };
  };

  it("navigates to the page its params name", () => {
    const { navigate, run } = register();
    run?.({ params: { url: "/invoices" } });
    expect(navigate).toHaveBeenCalledWith({ path: "/invoices" });
  });

  it("leaves the user where they are when its params are malformed", () => {
    const { navigate, run } = register();
    expect(() => run?.({ params: { url: 3 } })).not.toThrow();
    expect(() => run?.({})).not.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });
});
