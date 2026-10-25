// @vitest-environment jsdom
/**
 * The FullAgenda shell after the critic's first round: the right sidebar
 * and the sheet while dragging (#2), the form kept across panel ⇄ drawer
 * (#10), the height where nothing gives one (#11), a refused form left open
 * (#21), the save bar's count (#22), the compact switcher (#42), a sidebar
 * always reachable (#43), the sheet as a dialog (#44), notices showing their
 * resource (#45), pending items from the keyboard (#47), the period named by
 * the date picker (#48), the stale-data banner (#52), the save status (#53),
 * a popover with no chip to hang on (#54), no empty pill on the list (#63).
 */
import { computed, nextTick } from "vue";
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

useAgendaBlockHarness();

describe("sidebar", () => {
  it("#2 draws a right sidebar on the right, and the sheet out of the way while dragging", async () => {
    const right = await mountBlock({ sidebar: { position: "right" } });
    const aside = query(right.el, "[data-agenda-sidebar]")!;
    expect(aside.dataset.position).toBe("right");
    expect(aside.className).toContain("order-last");

    const { el, agenda } = await mountBlock({ sidebar: true }, 320);
    query(el, "[data-agenda-sidebar-toggle]")!.click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar-backdrop]")).not.toBeNull();
    agenda.dragActive.value = true;
    await nextTick();
    const sheet = query(el, "[data-agenda-sidebar]")!;
    expect(sheet.dataset.agendaSidebar).toBe("overlay");
    expect(sheet.className).toContain("pointer-events-none");
    expect(query(el, "[data-agenda-sidebar-backdrop]")).toBeNull();
  });

  it("#43 shows a sidebar that cannot fold, and keeps a button without a toolbar", async () => {
    const fixed = await mountBlock({
      sidebar: { collapsed: true, collapsible: false },
    });
    fixed.agenda.ctx.sidebarOpen.value = false;
    await nextTick();
    expect(
      query(fixed.el, "[data-agenda-sidebar]")?.dataset.agendaSidebar,
    ).toBe("column");

    const { el } = await mountBlock({ sidebar: true, toolbar: false }, 320);
    expect(query(el, "[data-agenda-toolbar]")).toBeNull();
    query(el, "[data-agenda-sidebar-toggle]")!.click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "overlay",
    );
  });

  it("#44 opens the sheet as a modal dialog, closed once a day is picked", async () => {
    const { el, agenda } = await mountBlock({ sidebar: true }, 320);
    query(el, "[data-agenda-sidebar-toggle]")!.click();
    await nextTick();
    const sheet = query(el, "[data-agenda-sidebar]")!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    agenda.ctx.anchor.value = "2026-11-02";
    await settle();
    expect(query(el, "[data-agenda-sidebar]")).toBeNull();
  });

  it("#45 brings a notice's resource into view", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const { el, agenda } = await mountBlock({
      sidebar: true,
      staticData: {
        ...AGENDA_STATIC,
        notices: [
          { message: "NE1 short", date: "2026-10-31", resourceId: "ne1" },
        ],
      },
    });
    const column = document.createElement("div");
    column.dataset.agendaResource = "ne1";
    query(el, "[data-dms-full-agenda]")!.append(column);
    agenda.ctx.rootEl.value = query(el, "[data-dms-full-agenda]");
    const notice = [
      ...el.querySelectorAll<HTMLElement>("[data-agenda-notices] [data-tone]"),
    ].find((item) => item.textContent?.includes("NE1 short"))!;
    notice.click();
    await settle();
    expect(agenda.ctx.goTo).toHaveBeenCalledWith("2026-10-31");
    expect(scrolled).toHaveBeenCalled();
  });

  it("#47 plans a pending item from the keyboard through the drag's rules", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    const item = query(el, '[data-agenda-pending-item="p1"]')!;
    expect(item.getAttribute("aria-describedby")).toBeTruthy();
    expect(item.className).not.toContain("touch-none");
    item.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(agenda.ctx.drag.planPending).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p1" }),
      ),
    );
    await vi.waitFor(() =>
      expect(agenda.ctx.announce).toHaveBeenCalledWith(
        'dms.agenda.sidebar.planned {"title":"Client_1"}',
      ),
    );
  });
});

describe("details", () => {
  it("#10 keeps what was typed when the panel becomes a drawer and back", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
    });
    const occurrence = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = { occurrence, mode: "edit", container: "panel" };
    await settle();
    const typed = el.querySelector<HTMLInputElement>(
      '[data-agenda-field="title"] input',
    )!;
    typed.value = "Sprint review";
    typed.dispatchEvent(new Event("input"));
    agenda.ctx.width.value = 700;
    await settle();
    expect(query(el, "[data-agenda-details-panel]")).toBeNull();
    expect(harness.drawerOpen).toHaveBeenCalled();
    agenda.ctx.width.value = 1400;
    await settle();
    const again = el.querySelector<HTMLInputElement>(
      '[data-agenda-field="title"] input',
    )!;
    expect(again.value).toBe("Sprint review");
  });

  it("#21 leaves the form open on what was typed when the route refuses", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
    });
    agenda.applyResult.value = false;
    agenda.ctx.details.value = {
      occurrence: agenda.ctx.occurrences.value[0]!,
      mode: "edit",
      container: "panel",
    };
    await settle();
    const title = el.querySelector<HTMLInputElement>(
      '[data-agenda-field="title"] input',
    )!;
    title.value = "Refused";
    title.dispatchEvent(new Event("input"));
    el.querySelector("form")!.dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await vi.waitFor(() =>
      expect(query(el, "[data-agenda-form-refused]")).not.toBeNull(),
    );
    expect(agenda.ctx.details.value?.mode).toBe("edit");
    expect(
      el.querySelector<HTMLInputElement>('[data-agenda-field="title"] input')!
        .value,
    ).toBe("Refused");
  });

  it("offers Overwrite / Take theirs on an event the route answered a conflict for", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
    });
    const occurrence = {
      ...agenda.ctx.occurrences.value[0]!,
      state: "conflict" as const,
      stateMessage: "Moved by Julie meanwhile",
    };
    agenda.ctx.stagedEdits = computed(() => [
      {
        key: "edit-7",
        status: "conflict" as const,
        change: { kind: "move" as const, id: "e1" },
      },
    ]);
    agenda.ctx.details.value = { occurrence, mode: "view", container: "panel" };
    await settle();
    const banner = query(el, "[data-agenda-details-conflict]")!;
    expect(banner.textContent).toContain("Moved by Julie meanwhile");
    query(banner, "[data-agenda-conflict-overwrite]")!.click();
    await vi.waitFor(() =>
      expect(agenda.ctx.resolveConflict).toHaveBeenCalledWith(
        "edit-7",
        "overwrite",
      ),
    );
    await vi.waitFor(() => expect(agenda.ctx.details.value).toBeNull());
  });

  it("#54 opens a popover with no chip to hang on near the top of the agenda", async () => {
    const { el, agenda } = await mountBlock({
      details: { container: "popover" },
    });
    agenda.ctx.rootEl.value = query(el, "[data-dms-full-agenda]");
    agenda.ctx.details.value = {
      occurrence: agenda.ctx.occurrences.value[1]!,
      mode: "view",
      container: "popover",
    };
    await settle();
    expect(query(el, '[data-agenda-details="popover"]')).not.toBeNull();
  });
});

describe("toolbar and states", () => {
  it("#22 counts on the save bar only what Save sends", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      saveMode: "staged",
    });
    stagedListOf(agenda.ctx).value = [
      { kind: "move", id: "e1", patch: { start: "2026-10-26T10:00:00+01:00" } },
      { kind: "move", id: "e2", patch: { start: "2026-10-27T15:00:00+01:00" } },
    ];
    agenda.sendable.value = 1;
    await nextTick();
    expect(query(el, "[data-save-bar]")?.textContent).toContain('"count":1');
  });

  it("#42 offers a compact agenda no view it would draw as another one", async () => {
    const { el } = await mountBlock({ views: ["week", "day", "month"] }, 320);
    const options = [
      ...el.querySelectorAll("[data-agenda-view-switcher] option"),
    ];
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "day",
      "month",
    ]);
  });

  it("#48 names the period on the date picker's button", async () => {
    const { el } = await mountBlock({ toolbar: { datePicker: true } });
    expect(
      query(el, "[data-agenda-period-picker]")?.getAttribute("aria-label"),
    ).toContain("26 Oct – 1 Nov 2026");
  });

  it("#52 keeps the events of a failed read under a banner with Retry", async () => {
    const { el, agenda } = await mountBlock({});
    agenda.error.value = new Error("offline");
    await nextTick();
    const banner = query(el, "[data-agenda-stale-error]")!;
    expect(banner).not.toBeNull();
    expect(query(el, "[data-block-status]")).toBeNull();
    banner.querySelector("button")!.click();
    expect(agenda.ctx.refresh).toHaveBeenCalled();
  });

  it("#53 says how an immediate save stands, not a staged one", async () => {
    const { el, agenda } = await mountBlock({ saveUrl: "/save" });
    // Mounted from the start, empty: a live region announces its changes.
    const status = query(el, "[data-agenda-save-status]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent?.trim()).toBe("");
    agenda.saveStatus.value = "saving";
    await nextTick();
    expect(query(el, "[data-agenda-save-status]")).toBe(status);
    expect(status.textContent).toContain("dms.agenda.save.saving");
    agenda.saveStatus.value = "saved";
    await nextTick();
    expect(status.textContent).toContain("dms.agenda.save.saved");
    const staged = await mountBlock({ saveUrl: "/save", saveMode: "staged" });
    expect(query(staged.el, "[data-agenda-save-status]")).toBeNull();
  });

  it("#63 leaves the list view to say it is empty", async () => {
    const list = await mountBlock({
      views: ["list"],
      staticData: { events: [] },
    });
    expect(query(list.el, "[data-agenda-empty]")).toBeNull();
    const week = await mountBlock({ staticData: { events: [] } });
    expect(query(week.el, "[data-agenda-empty]")).not.toBeNull();
  });
});

describe("height", () => {
  it("#11 fills only the page's filling block, else 44rem, bounded by the window in a modal", async () => {
    harness.pageFills.value = true;
    const last = await mountBlock({});
    const root = query(last.el, "[data-dms-full-agenda]")!;
    expect(root.style.height).toBe("");
    expect(root.dataset.height).toBe("fill");
    // N17: no floor of its own, the page region keeps its minimum.
    expect(root.className).not.toContain("min-h-[36rem]");

    const above = await mountBlock({}, 1400, { pageFill: false });
    await nextTick();
    expect(query(above.el, "[data-dms-full-agenda]")!.style.height).toBe(
      "44rem",
    );

    harness.pageFills.value = false;
    const modal = await mountBlock({ height: "fill" }, 600, {
      parentStyle: "display: block",
      pageFill: false,
      container: true,
    });
    await nextTick();
    // jsdom drops `min()` from inline styles: read what the block resolved.
    expect(query(modal.el, "[data-dms-full-agenda]")!.dataset.height).toBe(
      "min(44rem, calc(100dvh - 12rem))",
    );
  });
});

describe("form inputs", () => {
  it("#24 edits a custom datetime on the agenda's wall clock, saved with its offset", async () => {
    const { createApp, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/build/components/agenda/AgendaFieldInput.vue"
    );
    const updates: unknown[] = [];
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
          modelValue: "2026-10-26T08:30:00Z",
          timeZone: "Asia/Tokyo",
          "onUpdate:modelValue": (value: unknown) => updates.push(value),
        }),
    });
    app.mount(el);
    const input = el.querySelector("input")!;
    expect(input.value).toBe("2026-10-26T17:30");
    input.value = "2026-10-26T18:00";
    input.dispatchEvent(new Event("input"));
    expect(updates).toEqual(["2026-10-26T18:00:00+09:00"]);
    app.unmount();
  });
});
