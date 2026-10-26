// @vitest-environment jsdom
/**
 * The FullAgenda shell after the critic's second round, through the block:
 * a draft dropped when the details leave its event (N5), keyboard planning
 * through the drag's rules and its result announced (N6), the fill that
 * follows the page's mark (N17), "N conflicts to resolve" (N18), the toolbar
 * out of reach under the sheet (N21), the save status without a toolbar
 * (N23), the route's refusal in the form (N28), a custom datetime kept in
 * the repeated DST hour (N29), the strip instead of a button over the views
 * (N32), the legend's plural (N33), stacked sidebar sections (L3).
 */
import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { stagedListOf } from "./fixtures/agendaFakeContext";
import {
  AGENDA_STATIC,
  harness,
  mountBlock as mountWith,
  query,
  useAgendaBlockHarness,
  type AgendaMountPlace,
} from "./fixtures/agendaBlockHarness";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";
import enGB from "../layers/dms-ui/i18n/locales/ui-agenda-en-GB.json";

const fixture = () => import("./fixtures/agendaBlockHarness");
vi.mock(
  "../layers/dms-ui/app/build/composables/agenda/useAgenda",
  async () => (await fixture()).mocks.useAgenda,
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaTimeGrid.vue",
  async () => (await fixture()).mocks.view("time-grid"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaMonthView.vue",
  async () => (await fixture()).mocks.view("month"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaTimelineView.vue",
  async () => (await fixture()).mocks.view("timeline"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaYearView.vue",
  async () => (await fixture()).mocks.view("year"),
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaListView.vue",
  async () => (await fixture()).mocks.view("list"),
);
vi.mock(
  "../layers/dms-ui/app/components/form/components/Calendar.vue",
  async () => (await fixture()).mocks.calendar,
);
vi.mock(
  "../layers/dms-ui/app/build/components/matrix/MatrixCellValue.vue",
  async () => (await fixture()).mocks.cellValue,
);
vi.mock(
  "../layers/dms-ui/app/build/components/matrix/MatrixFieldInput.vue",
  async () => (await fixture()).mocks.fieldInput,
);
vi.mock(
  "../layers/dms-ui/app/composables/resolveDmsComponent",
  async () => (await fixture()).mocks.resolveDmsComponent,
);
vi.mock(
  "../layers/dms-ui/app/composables/containers/useDrawer",
  async () => (await fixture()).mocks.useDrawer,
);
vi.mock(
  "../layers/dms-ui/app/composables/containers/useModal",
  async () => (await fixture()).mocks.useModal,
);
vi.mock(
  "../layers/dms-ui/app/composables/confirm/useConfirm",
  async () => (await fixture()).mocks.useConfirm,
);
vi.mock(
  "../layers/dms-layout/app/composables/layout/usePageFillHeight",
  async () => (await fixture()).mocks.usePageFillHeight,
);
vi.mock(
  "../layers/dms-ui/app/components/save-bar/SaveBar.vue",
  async () => (await fixture()).mocks.saveBar,
);
vi.mock(
  "../layers/dms-ui/app/build/components/blocks/BlockInlineStatus.vue",
  async () => (await fixture()).mocks.inlineStatus,
);
vi.mock(
  "../layers/dms-core/app/composables/watch/useWatch",
  async () => (await fixture()).mocks.useWatch,
);
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  async () => (await fixture()).mocks.useComponentEvent,
);

const { default: FullAgendaBlock } = await import(
  "../layers/dms-ui/app/components/blocks/FullAgendaBlock.vue"
);

const mountBlock = (
  options: Partial<FullAgendaOptions> = {},
  width = 1400,
  place: AgendaMountPlace = {},
) => mountWith(FullAgendaBlock, options, width, place);
const settle = async () => {
  await nextTick();
  await nextTick();
};
const titleInput = (el: HTMLElement) =>
  el.querySelector<HTMLInputElement>('[data-agenda-field="title"] input')!;
const type = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
};

useAgendaBlockHarness();

describe("details", () => {
  it("N5 drops what was typed on an event once another one opens", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
    });
    const [first, second] = agenda.ctx.occurrences.value;
    agenda.ctx.details.value = {
      occurrence: first!,
      mode: "edit",
      container: "panel",
    };
    await settle();
    type(titleInput(el), "Abandoned");
    agenda.ctx.details.value = {
      occurrence: second!,
      mode: "view",
      container: "panel",
    };
    await settle();
    agenda.ctx.details.value = {
      occurrence: first!,
      mode: "edit",
      container: "panel",
    };
    await settle();
    expect(titleInput(el).value).toBe("Sprint planning");
  });

  it("N28 shows the route's refusal in the form", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
    });
    agenda.ctx.apply = vi.fn(async () => {
      agenda.ctx.lastRefusal!.value = {
        id: "e1",
        message: "Locked by payroll",
      };
      return false;
    });
    agenda.ctx.details.value = {
      occurrence: agenda.ctx.occurrences.value[0]!,
      mode: "edit",
      container: "panel",
    };
    await settle();
    type(titleInput(el), "Refused");
    el.querySelector("form")!.dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await vi.waitFor(() =>
      expect(query(el, "[data-agenda-form-refused]")?.textContent).toContain(
        "Locked by payroll",
      ),
    );
  });
});

describe("sidebar", () => {
  it("N6 says when the drag's rules found no place for an item", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    vi.mocked(agenda.ctx.drag.planPending).mockResolvedValueOnce(false);
    query(el, '[data-agenda-pending-item="p1"]')!.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(agenda.ctx.announce).toHaveBeenCalledWith(
        'dms.agenda.sidebar.not_planned {"title":"Client_1"}',
      ),
    );
    expect(agenda.ctx.apply).not.toHaveBeenCalled();
  });

  it("N21 puts the toolbar out of reach while the sheet is open", async () => {
    const { el } = await mountBlock({ sidebar: true }, 320);
    const toolbar = query(el, "[data-agenda-toolbar]")!;
    expect(toolbar.hasAttribute("inert")).toBe(false);
    query(el, "[data-agenda-sidebar-toggle]")!.click();
    await nextTick();
    expect(query(el, "[data-agenda-toolbar]")!.hasAttribute("inert")).toBe(
      true,
    );
  });

  it("N32 keeps the sidebar button in a strip above the views, not over them", async () => {
    const { el } = await mountBlock({ sidebar: true, toolbar: false }, 320);
    const strip = query(el, "[data-agenda-strip]")!;
    expect(strip.querySelector("[data-agenda-sidebar-toggle]")).not.toBeNull();
    expect(
      strip.querySelector("[data-agenda-sidebar-toggle]")!.className,
    ).not.toContain("absolute");
  });

  it("L3 stacks the sidebar's sections; the pending items scroll in their own height", async () => {
    const { el } = await mountBlock({
      sidebar: { position: "right" },
      unscheduled: {},
    });
    expect(query(el, "[data-agenda-sidebar]")!.className).toContain(
      "[&>*]:shrink-0",
    );
    expect(query(el, "[data-agenda-pending]")!.className).not.toContain(
      "min-h-0",
    );
    const items = query(el, "[data-agenda-pending-items]")!;
    expect(items.className).toContain("max-h-80");
    expect(items.className).toContain("overflow-y-auto");
  });

  it("N33 counts the legend's events with a plural form", async () => {
    const calls: unknown[][] = [];
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en-GB"),
      t: (...args: unknown[]) => {
        calls.push(args);
        return String(args[0]);
      },
    }));
    await mountBlock({ sidebar: true });
    const count = calls.find(
      (args) => args[0] === "dms.agenda.sidebar.calendar_count",
    );
    expect(count?.[2]).toBe(2);
    expect(enGB.dms.agenda.sidebar.calendar_count).toBe(
      "{name}, {count} event | {name}, {count} events",
    );
  });
});

describe("sidebar sections", () => {
  it("keeps each pending item at its natural height; only the list scrolls", async () => {
    const { el } = await mountBlock({ sidebar: true, unscheduled: {} });
    const item = query(el, '[data-agenda-pending-item="p1"]')!;
    expect(item.className).toContain("shrink-0");
    expect(item.textContent).toContain("45601");
  });

  it("hides empty checks, unless the sidebar lists them: then all is said well", async () => {
    const quiet = {
      ...AGENDA_STATIC,
      notices: [],
      events: AGENDA_STATIC.events.map(
        ({ issues: _issues, ...event }) => event,
      ),
    };
    const hidden = await mountBlock({
      sidebar: { sections: ["unscheduled"] },
      staticData: quiet,
    });
    expect(query(hidden.el, "[data-agenda-notices]")).toBeNull();
    const asked = await mountBlock({
      sidebar: { sections: ["notices"] },
      staticData: quiet,
    });
    expect(
      query(asked.el, "[data-agenda-notices-empty]")?.textContent,
    ).toContain("dms.agenda.sidebar.notices_empty");
    const busy = await mountBlock({ sidebar: { sections: ["notices"] } });
    expect(query(busy.el, "[data-agenda-notices-empty]")).toBeNull();
    expect(
      busy.el.querySelectorAll("[data-agenda-notices] [data-tone]").length,
    ).toBe(2);
  });
});

describe("save", () => {
  it("N18 leads the bar to the conflicts when only they are left", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      saveMode: "staged",
    });
    agenda.statuses.value = ["conflict"];
    agenda.sendable.value = 0;
    stagedListOf(agenda.ctx).value = [{ kind: "move", id: "e1" }];
    await nextTick();
    const bar = query(el, "[data-save-bar]")!;
    expect(bar.textContent).toContain(
      "dms.agenda.details.conflicts_to_resolve",
    );
    bar.click();
    await vi.waitFor(() => expect(harness.modalOpen).toHaveBeenCalled());
    expect(agenda.ctx.saveStaged).not.toHaveBeenCalled();
  });

  it("N23 shows the save status without a toolbar too", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      toolbar: false,
    });
    const status = query(el, "[data-agenda-strip] [data-agenda-save-status]")!;
    expect(status).not.toBeNull();
    agenda.saveStatus.value = "error";
    await nextTick();
    expect(status.textContent).toContain("dms.agenda.details.status_error");
  });
});

describe("toolbar", () => {
  it("disables Today, with a tooltip, when today is outside the dates offered", async () => {
    const { el, agenda } = await mountBlock({});
    const today = () => query(el, "[data-agenda-today] button")!;
    expect(today().hasAttribute("disabled")).toBe(false);
    agenda.canGoToday.value = false;
    await nextTick();
    expect(today().hasAttribute("disabled")).toBe(true);
    today().click();
    expect(agenda.ctx.goToday).not.toHaveBeenCalled();
  });
});

describe("height", () => {
  it("N17 follows the page when it moves its fill to another block", async () => {
    harness.pageFills.value = true;
    const { el } = await mountBlock({});
    const root = query(el, "[data-dms-full-agenda]")!;
    expect(root.dataset.height).toBe("fill");
    // A block is added under it: the page marks that one instead.
    el.removeAttribute("data-dms-page-fill");
    await vi.waitFor(() => expect(root.dataset.height).toBe("44rem"));
  });
});

describe("form inputs", () => {
  it("N29 keeps a custom datetime of the repeated DST hour, reads a zone-less one on the agenda's clock", async () => {
    const { createApp, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/build/components/agenda/AgendaFieldInput.vue"
    );
    const mount = (modelValue: string, updates: unknown[]) => {
      const el = document.createElement("div");
      const app = createApp({
        render: () =>
          h(AgendaFieldInput, {
            field: {
              id: "due",
              kind: "datetime",
              label: "Due",
              options: [],
              required: false,
              readOnly: false,
            },
            modelValue,
            timeZone: "Europe/Brussels",
            "onUpdate:modelValue": (value: unknown) => updates.push(value),
          }),
      });
      app.mount(el);
      return { input: el.querySelector("input")!, app };
    };
    // 01:30Z on 25/10 is the SECOND 02:30 in Brussels (after the clocks went back).
    const updates: unknown[] = [];
    const repeated = mount("2026-10-25T01:30:00Z", updates);
    expect(repeated.input.value).toBe("2026-10-25T02:30");
    type(repeated.input, "2026-10-25T02:30");
    expect(updates).toEqual(["2026-10-25T01:30:00Z"]);
    repeated.app.unmount();
    // Stored without an offset: already a wall clock of the agenda's zone.
    const legacy = mount("2026-10-26T09:30", []);
    expect(legacy.input.value).toBe("2026-10-26T09:30");
    legacy.app.unmount();
  });
});
