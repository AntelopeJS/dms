import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getErrorPayload,
  getItemId,
} from "../layers/dms-ui/app/build/composables/table-view/tableRowActionValues";
import {
  isGroupedConfig,
  isKanbanConfig,
} from "../layers/dms-ui/app/build/composables/table-view/utils/displayOptions";
import { navBadgeCount } from "../layers/dms-ui/app/entries/composables/table-view/utils/tableCounts";
import { nextExpandedRows } from "../layers/dms-ui/app/entries/composables/table-view/utils/expandedRows";
import { TableViewFunctions } from "../layers/dms-ui/app/composables/table-view/types/functions";
import { rowGroupKey } from "../layers/dms-ui/app/entries/composables/table-view/utils/groupedRows";

vi.stubGlobal("ref", ref);
const { useDefinedFunctions } = await import(
  "../layers/dms-core/app/composables/functions/useDefinedFunction"
);
const { registerDefaultFunctions } = await import(
  "../layers/dms-ui/app/entries/composables/table-view/registerDefaultFunctions"
);

describe("a row id is read as text", () => {
  it("stringifies a numeric id and skips a value that is no id", () => {
    expect(getItemId({ _id: 7 })).toBe("7");
    expect(getItemId({ _id: {}, id: "row-1" })).toBe("row-1");
    expect(getItemId({ _id: null })).toBeUndefined();
  });
});

describe("an error payload reaches listeners as the server sent it", () => {
  it("keeps a body object, falls back to the message, ignores a non-error", () => {
    const body = { message: "Refused", fields: ["name"] };
    expect(getErrorPayload({ data: body, message: "x" })).toBe(body);
    expect(getErrorPayload({ data: "", message: "Failed" })).toBe("Failed");
    expect(getErrorPayload(null)).toBeUndefined();
    expect(getErrorPayload("boom")).toBeUndefined();
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

describe("display options are taken whole or not at all", () => {
  it("rejects options whose field is not a name or whose flags are not flags", () => {
    expect(isKanbanConfig({ groupByField: "status", draggable: true })).toBe(
      true,
    );
    expect(isKanbanConfig({ groupByField: 3 })).toBe(false);
    expect(isKanbanConfig({ groupByField: "status", draggable: "yes" })).toBe(
      false,
    );
    expect(isGroupedConfig({ groupByField: "day", by: "week" })).toBe(true);
    expect(isGroupedConfig({ groupByField: "day", by: "year" })).toBe(false);
    expect(isGroupedConfig(undefined)).toBe(false);
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
