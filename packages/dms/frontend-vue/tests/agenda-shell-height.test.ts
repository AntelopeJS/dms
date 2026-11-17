/** @vitest-environment jsdom */
/**
 * The FullAgenda shell's height and narrow screens: a veil that stops being `display: contents` ends the fill; at
 * 420 px the header stacks its title, description and actions, and the view
 * switcher names the view drawn (a week drawn as its day reads "Day").
 */
import { computed, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  harness,
  mountBlock as mountWith,
  query,
  useAgendaBlockHarness,
  type AgendaMountPlace,
} from "./fixtures/agendaBlockHarness";
import AgendaFrame from "../layers/dms-ui/app/entries/components/agenda/AgendaFrame";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";

const mountBlock = (
  options: Partial<FullAgendaOptions> = {},
  width = 1400,
  place: AgendaMountPlace = {},
) => mountWith(AgendaFrame, options, width, place);

useAgendaBlockHarness();

const PHONE = 420;

describe("height", () => {
  it("stops filling when the veil around the block becomes a box", async () => {
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
        target: { type: "api", url: "/recap", successMessage: "Done" },
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
    const select = el.querySelector<HTMLSelectElement>(
      "[data-agenda-view-switcher]",
    )!;
    const options = [...select.querySelectorAll("option")].map((option) => [
      option.getAttribute("value"),
      option.textContent,
    ]);
    expect(options).toEqual([
      ["week", "dms.agenda.views.day"],
      ["month", "dms.agenda.views.month"],
      ["list", "dms.agenda.views.list"],
    ]);
    expect(select.value).toBe("week");
  });

  it("reads Day, not blank, when the picked view is 3 days", async () => {
    const { el, agenda } = await mountBlock(
      { views: ["week", "month", "days", "list"] },
      PHONE,
    );
    agenda.ctx.pickedViewId.value = "days";
    await nextTick();
    expect(agenda.ctx.view.value.id).toBe("days:compact");
    const select = el.querySelector<HTMLSelectElement>(
      "[data-agenda-view-switcher]",
    )!;
    expect(select.value).toBe("week");
    expect(select.selectedOptions[0]?.textContent).toBe("dms.agenda.views.day");
  });
});

describe("review", () => {
  it("shows before → after for a change of the end alone", async () => {
    const { createApp } = await import("vue");
    const { fakeAgendaContext } = await import("./fixtures/agendaFakeContext");
    const { default: AgendaReviewList } = await import(
      "../layers/dms-ui/app/entries/components/agenda/AgendaReviewList"
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
    ctx.stagedEdits = computed(() => [
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
    ]);
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
