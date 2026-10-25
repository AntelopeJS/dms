// @vitest-environment jsdom
/**
 * The FullAgenda shell after the critic's third round and the lead's phone
 * pass: a veil that stops being `display: contents` ends the fill (m12); at
 * 420 px the header stacks its title, description and actions, and the view
 * switcher names the view drawn (a week drawn as its day reads "Day").
 */
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
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

useAgendaBlockHarness();

const PHONE = 420;

describe("height", () => {
  it("m12 stops filling when the veil around the block becomes a box", async () => {
    harness.pageFills.value = true;
    const { el } = await mountBlock({}, 1400, { veil: "display: contents" });
    const root = query(el, "[data-dms-full-agenda]")!;
    expect(root.dataset.height).toBe("fill");
    query(el, "[data-veil]")!.style.display = "block";
    await vi.waitFor(() => expect(root.dataset.height).toBe("44rem"));
  });
});

describe("at 420 px", () => {
  const header: Partial<FullAgendaOptions> = {
    title: "Agenda commercial",
    description: "Équipe vente — agence de Liège",
    saveUrl: "/save",
    toolbarActions: [
      {
        id: "recap",
        label: "Envoyer le récap",
        target: { type: "api", url: "/recap" } as never,
      },
    ],
  };

  it("stacks the title and description over the actions", async () => {
    const { el } = await mountBlock(header, PHONE);
    expect(query(el, "[data-agenda-toolbar-header]")!.className).toContain(
      "flex-col",
    );
    expect(query(el, "[data-agenda-toolbar-title]")!.className).toContain(
      "w-full",
    );
    const actions = query(el, "[data-agenda-toolbar-actions]")!;
    expect(actions.className).toContain("w-full");
    expect(actions.className).toContain("flex-wrap");
    expect(
      query(el, "[data-agenda-toolbar-header] h2")!.className,
    ).not.toContain("truncate");
    const wide = await mountBlock(header, 1400);
    expect(
      query(wide.el, "[data-agenda-toolbar-header]")!.className,
    ).not.toContain("flex-col");
  });

  it("names the view drawn: a week drawn as its day reads Day, once", async () => {
    const { el, agenda } = await mountBlock(
      { views: ["week", "month", "days", "list"] },
      PHONE,
    );
    agenda.ctx.pickedViewId.value = "week";
    await nextTick();
    expect(agenda.ctx.view.value.type).toBe("day");
    const select = query(
      el,
      "[data-agenda-view-switcher]",
    ) as HTMLSelectElement;
    const options = [...select.querySelectorAll("option")].map((option) => [
      option.getAttribute("value"),
      option.textContent,
    ]);
    // "3 days" is drawn as a day too: one "Day" item, not two.
    expect(options).toEqual([
      ["week", "dms.agenda.views.day"],
      ["month", "dms.agenda.views.month"],
      ["list", "dms.agenda.views.list"],
    ]);
    expect(select.value).toBe("week");
  });
});

describe("review", () => {
  it("#23 shows before → after for a change of the end alone", async () => {
    const { createApp } = await import("vue");
    const { fakeAgendaContext } = await import("./fixtures/agendaFakeContext");
    const { default: AgendaReviewList } = await import(
      "../layers/dms-ui/app/build/components/agenda/AgendaReviewList.vue"
    );
    const meeting = {
      id: "e1",
      title: "Sprint planning",
      start: "2026-10-26T09:00:00+01:00",
      end: "2026-10-26T10:00:00+01:00",
    };
    const { ctx } = fakeAgendaContext({
      saveUrl: "/save",
      staticData: { events: [meeting] },
    });
    ctx.stagedEdits = {
      value: [
        {
          key: "k1",
          status: "staged",
          base: meeting,
          change: {
            kind: "resize",
            id: "e1",
            patch: { end: "2026-10-26T11:00:00+01:00" },
            previous: { end: "2026-10-26T10:00:00+01:00" },
          },
        },
      ],
    } as typeof ctx.stagedEdits;
    const el = document.createElement("div");
    const app = createApp(AgendaReviewList, { context: ctx });
    app.mount(el);
    const times = el.querySelectorAll("[data-agenda-review] li p")[1]!;
    expect(
      [...times.querySelectorAll("span")].map((span) => span.textContent),
    ).toEqual([
      "medium:2026-10-26 08:00 – medium:2026-10-26 09:00",
      "medium:2026-10-26 08:00 – medium:2026-10-26 10:00",
    ]);
    app.unmount();
  });
});
