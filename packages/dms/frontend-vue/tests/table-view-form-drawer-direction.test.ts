import { ref, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FormContainerType,
  TableRowAction,
} from "../layers/dms-ui/app/entries/composables/table-view/types";
import { fetchClientMock } from "./fixtures/unusedApi";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { Color } from "../layers/dms-core/app/types/color";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { normalizeActionConfig } from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import type { useDrawer } from "../layers/dms-ui/app/composables/containers/useDrawer";

vi.stubGlobal("ref", ref);
vi.stubGlobal("shallowRef", shallowRef);
const { useTableRowActions } = await import(
  "../layers/dms-ui/app/entries/composables/table-view/useTableViewRowActions"
);

describe("a table view's drawer form", () => {
  const openDrawer = vi.fn<ReturnType<typeof useDrawer>["open"]>();

  beforeEach(() => {
    openDrawer.mockReset();
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
    vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
    vi.stubGlobal("useDrawer", () => ({ open: openDrawer }));
    vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
    vi.stubGlobal("interpolateUrl", interpolateUrl);
    vi.stubGlobal("navigateDms", vi.fn());
    vi.stubGlobal("resolveDmsComponent", vi.fn());
    vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
    vi.stubGlobal("useComponentEvent", () => ({
      sendComponentEvent: vi.fn(),
    }));
    vi.stubGlobal("useEventedAction", useEventedAction);
    vi.stubGlobal("normalizeActionConfig", normalizeActionConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ref", ref);
  });

  const openedFrom = (direction?: "bottom" | "right") => {
    useTableRowActions({
      api: fetchClientMock(),
      location: "/api/task",
      columns: [],
      componentId: "table",
      pageId: "tasks",
      formContainer: { type: FormContainerType.drawer, direction },
      formComponents: {
        new: {
          componentName: "DmsFormBlock",
          options: { componentId: "form", pageId: "tasks" },
        },
      },
    }).createFormContainer({ action: TableRowAction.new });
    const [options] = openDrawer.mock.lastCall ?? [];
    return options?.direction;
  };

  it("slides in from the direction formContainer names (fails when direction is dropped)", () => {
    expect(openedFrom("right")).toBe("right");
  });

  it("slides in from the bottom when formContainer names no direction", () => {
    expect(openedFrom()).toBe("bottom");
    expect(openedFrom("bottom")).toBe("bottom");
  });
});
