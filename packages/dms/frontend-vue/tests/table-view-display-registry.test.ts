import { ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTableViewDisplay } from "../layers/dms-ui/app/composables/table-view/useTableViewDisplays";
import { storeTableViewDisplay } from "../layers/dms-ui/app/build/composables/table-view/displayRegistry";
import type { TableViewDisplay } from "../layers/dms-ui/app/composables/table-view/types/display";

const display = (id: string): TableViewDisplay => ({
  id,
  label: id,
  icon: "i-ph-cards",
});

describe("table view display registry", () => {
  let state: Ref<TableViewDisplay[]>;

  beforeEach(() => {
    state = ref([]);
    vi.stubGlobal("useDmsState", () => state);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a module display under <module>:<id>", () => {
    registerTableViewDisplay(display("saas:plan-cards"));
    expect(state.value.map((entry) => entry.id)).toEqual(["saas:plan-cards"]);
  });

  it.each(["table", "kanban", "cards", "grouped"])(
    "refuses the reserved id %s",
    (id) => {
      expect(() => registerTableViewDisplay(display(id))).toThrow(
        /is a built-in display/,
      );
    },
  );

  it("refuses an id without its module prefix", () => {
    expect(() => registerTableViewDisplay(display("timeline"))).toThrow(
      /must be named "<module>:<id>"/,
    );
  });

  it("refuses to overwrite a display another registration claimed", () => {
    registerTableViewDisplay(display("automation:timeline"));
    expect(() =>
      registerTableViewDisplay(display("automation:timeline")),
    ).toThrow(/already registered/);
  });

  it("lets the DMS store its built-in displays", () => {
    storeTableViewDisplay(display("cards"));
    expect(() => registerTableViewDisplay(display("cards"))).toThrow(
      /is a built-in display/,
    );
    expect(state.value.map((entry) => entry.id)).toEqual(["cards"]);
  });
});
