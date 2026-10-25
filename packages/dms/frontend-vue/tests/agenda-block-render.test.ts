// @vitest-environment jsdom
/**
 * The FullAgenda block around its views, from static data through a fake
 * context: toolbar, sidebar (mini calendar, legend with toggles and counts,
 * pending items as drag sources over a drop surface, notices, tip), the view
 * of the context, the details panel with its read view and form, the staged
 * save bar and Ctrl+S, the error and empty states, the height, and how it
 * lays out at 320, 700 and 1400 px wide.
 */
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { fakeOccurrence, stagedListOf } from "./fixtures/agendaFakeContext";
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
const drawerOpen = harness.drawerOpen;
const modalOpen = harness.modalOpen;
const STATIC = AGENDA_STATIC;

useAgendaBlockHarness();

describe("a full agenda", () => {
  it("draws the toolbar, the sidebar's sections and the view of the context", async () => {
    const { el, agenda } = await mountBlock({
      title: "Team calendar",
      saveUrl: "/save",
      sidebar: { tip: "Drag an event to move it" },
      unscheduled: { search: true },
    });
    expect(el.textContent).toContain("Team calendar");
    expect(query(el, "[data-agenda-period]")?.textContent).toContain(
      "26 Oct – 1 Nov 2026",
    );
    expect(
      query(el, "[data-agenda-view-switcher]")?.dataset.agendaViewSwitcher,
    ).toBe("segmented");
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "column",
    );
    expect(query(el, "[data-agenda-mini-calendar]")).not.toBeNull();
    expect(query(el, "[data-agenda-view]")?.dataset.agendaView).toBe("week");
    expect(query(el, "[data-agenda-tip]")?.textContent).toContain(
      "Drag an event",
    );
    // The legend: a toggle per calendar with its count.
    const design = query(el, '[data-agenda-calendar="design"]')!;
    // A checkbox named by its calendar and count, the same checked or not.
    expect(design.getAttribute("role")).toBe("checkbox");
    expect(design.getAttribute("aria-checked")).toBe("true");
    expect(design.getAttribute("aria-label")).toBe(
      'dms.agenda.sidebar.calendar_count {"name":"Design","count":2}',
    );
    expect(design.textContent).toContain("2");
    design.click();
    expect(agenda.ctx.toggleCalendar).toHaveBeenCalledWith("design");
    // Notices: the agenda's and the events' issues, errors first.
    const notices = el.querySelectorAll("[data-agenda-notices] [data-tone]");
    expect(
      [...notices].map((notice) => notice.getAttribute("data-tone")),
    ).toEqual(["error", "warning"]);
    expect(notices[0]?.textContent).toContain("Sprint planning");
    (notices[1] as HTMLElement).click();
    expect(agenda.ctx.goTo).toHaveBeenCalledWith("2026-10-31");
  });

  it("drags pending items and takes events back on its drop surface", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    const item = query(el, '[data-agenda-pending-item="p1"]')!;
    item.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(agenda.ctx.drag.startPending).toHaveBeenCalledWith(
      expect.any(Event),
      expect.objectContaining({ id: "p1" }),
    );
    expect(agenda.surfaces).toHaveLength(1);
    expect(agenda.surfaces[0]!.resolve(0, 0)).toMatchObject({ pending: true });
  });

  it("shows the details in a panel: read view, actions, then the form", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "panel" },
      fields: [{ id: "dossier", label: "Dossier" }],
      eventActions: [
        {
          id: "done",
          label: "Mark as done",
          target: { type: "api", url: "/done" } as never,
        },
        {
          id: "hidden",
          label: "Never",
          target: { type: "api", url: "/x" } as never,
          visibleWhen: { field: "dossier", in: ["0"] },
        },
      ],
    });
    const occurrence = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = { occurrence, mode: "view", container: "panel" };
    await nextTick();
    await nextTick();
    const panel = query(el, "[data-agenda-details-panel]")!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Sprint planning");
    expect(
      query(panel, '[data-agenda-details-field="dossier"]')?.textContent,
    ).toContain("45601");
    expect(panel.querySelectorAll("[data-agenda-event-action]")).toHaveLength(
      1,
    );
    query(panel, '[data-agenda-event-action="done"]')!.click();
    expect(agenda.ctx.runEventAction).toHaveBeenCalled();
    query(panel, "[data-agenda-details-edit]")!.click();
    await nextTick();
    const title = panel.querySelector<HTMLInputElement>(
      '[data-agenda-field="title"] input',
    )!;
    title.value = "Sprint review";
    title.dispatchEvent(new Event("input"));
    await nextTick();
    panel
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(agenda.applied).toHaveLength(1));
    expect(agenda.applied[0]).toMatchObject({
      kind: "update",
      id: "e1",
      patch: { title: "Sprint review" },
    });
    expect(drawerOpen).not.toHaveBeenCalled();
  });

  it("opens the details in a drawer by default, with the agenda as context", async () => {
    const { agenda } = await mountBlock({});
    agenda.ctx.details.value = {
      occurrence: fakeOccurrence(STATIC.events[1]!),
      mode: "view",
      container: "drawer",
    };
    await nextTick();
    await nextTick();
    expect(drawerOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Design critique",
        componentOptions: { context: agenda.ctx, surface: "drawer" },
      }),
    );
  });

  it("holds staged changes under a save bar, Ctrl+S left to the agenda's shortcuts", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      saveMode: "staged",
    });
    stagedListOf(agenda.ctx).value = [
      { kind: "move", id: "e1", patch: { start: "2026-10-26T10:00:00+01:00" } },
    ];
    await nextTick();
    expect(query(el, "[data-save-bar]")?.textContent).toContain(
      "dms.agenda.save.save_label",
    );
    const key = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    query(el, "[data-dms-full-agenda]")!.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    query(el, "[data-save-bar]")!.click();
    await vi.waitFor(() => expect(agenda.ctx.saveStaged).toHaveBeenCalled());
    expect(modalOpen).not.toHaveBeenCalled();
  });

  it("reviews staged changes before writing them, from the bar or Ctrl+S", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      saveMode: "staged",
      review: true,
    });
    stagedListOf(agenda.ctx).value = [{ kind: "delete", id: "e2" }];
    await nextTick();
    expect(query(el, "[data-save-bar]")?.textContent).toContain(
      "dms.agenda.save.review_label",
    );
    const key = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    query(el, "[data-dms-full-agenda]")!.dispatchEvent(key);
    // Handled here: the agenda's own Ctrl+S skips it and saves nothing blind.
    expect(key.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(agenda.ctx.saveStaged).toHaveBeenCalled());
    expect(modalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ componentOptions: { context: agenda.ctx } }),
    );
  });

  it("says when the period is empty, takes 44rem, or fills a filling page", async () => {
    const { el } = await mountBlock({
      staticData: { events: [] },
      emptyLabel: "Nothing planned",
    });
    expect(query(el, "[data-agenda-empty]")?.textContent).toContain(
      "Nothing planned",
    );
    expect(query(el, "[data-dms-full-agenda]")?.style.height).toBe("44rem");
    harness.pageFills.value = true;
    const filled = await mountBlock({});
    const root = query(filled.el, "[data-dms-full-agenda]")!;
    expect(root.style.height).toBe("");
    expect(root.className).toContain("flex-1");
  });

  it("hides the toolbar when asked", async () => {
    const { el } = await mountBlock({ toolbar: false });
    expect(query(el, "[data-agenda-toolbar]")).toBeNull();
  });
});

describe("container widths", () => {
  it("folds the sidebar into a sheet and the views into a select at 320 px", async () => {
    const { el } = await mountBlock({ sidebar: true }, 320);
    expect(query(el, "[data-dms-full-agenda]")?.dataset.compact).toBe("true");
    expect(query(el, "[data-agenda-sidebar]")).toBeNull();
    expect(query(el, "[data-agenda-view-switcher]")?.tagName).toBe("SELECT");
    query(el, "[data-agenda-sidebar-toggle]")!.click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "overlay",
    );
    query(el, "[data-agenda-sidebar-backdrop]")!.click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar]")).toBeNull();
  });

  it("keeps the sidebar at 700 px and opens a panel as a drawer", async () => {
    const { el, agenda } = await mountBlock(
      { sidebar: true, details: { container: "panel" } },
      700,
    );
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "column",
    );
    expect(query(el, "[data-agenda-view-switcher]")?.tagName).toBe("SELECT");
    agenda.ctx.details.value = {
      occurrence: agenda.ctx.occurrences.value[0]!,
      mode: "view",
      container: "panel",
    };
    await nextTick();
    await nextTick();
    expect(query(el, "[data-agenda-details-panel]")).toBeNull();
    expect(drawerOpen).toHaveBeenCalled();
  });

  it("follows the container as it widens to 1400 px", async () => {
    const { el, agenda } = await mountBlock({ sidebar: true }, 320);
    agenda.ctx.width.value = 1400;
    await nextTick();
    expect(
      query(el, "[data-dms-full-agenda]")?.dataset.compact,
    ).toBeUndefined();
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "column",
    );
    expect(
      query(el, "[data-agenda-view-switcher]")?.dataset.agendaViewSwitcher,
    ).toBe("segmented");
  });
});
