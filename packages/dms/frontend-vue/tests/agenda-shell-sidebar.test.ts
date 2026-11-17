/** @vitest-environment jsdom */
/**
 * The FullAgenda shell's sidebar and forms, through the block:
 * a draft dropped when the details leave its event, keyboard planning
 * through the drag's rules and its result announced, the fill that
 * follows the page's mark, "N conflicts to resolve", the toolbar
 * out of reach under the sheet, the save status without a toolbar,
 * the route's refusal in the form, a custom datetime kept in
 * the repeated DST hour, the strip instead of a button over the views,
 * the legend's plural, stacked sidebar sections.
 */
import type { AgendaFormValue } from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { stagedListOf } from "./fixtures/agendaFakeContext";
import {
  AGENDA_STATIC,
  harness,
  mountBlock as mountWith,
  query,
  saveButton,
  useAgendaBlockHarness,
  type AgendaMountPlace,
} from "./fixtures/agendaBlockHarness";
import AgendaFrame from "../layers/dms-ui/app/entries/components/agenda/AgendaFrame";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";
import enGB from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";

const mountBlock = (
  options: Partial<FullAgendaOptions> = {},
  width = 1400,
  place: AgendaMountPlace = {},
) => mountWith(AgendaFrame, options, width, place);
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
  it("drops what was typed on an event once another one opens", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "popover" },
    });
    const [first, second] = agenda.ctx.occurrences.value;
    agenda.ctx.details.value = {
      occurrence: first!,
      mode: "edit",
      container: "popover",
    };
    await settle();
    type(titleInput(el), "Abandoned");
    agenda.ctx.details.value = {
      occurrence: second!,
      mode: "view",
      container: "popover",
    };
    await settle();
    agenda.ctx.details.value = {
      occurrence: first!,
      mode: "edit",
      container: "popover",
    };
    await settle();
    expect(titleInput(el).value).toBe("Sprint planning");
  });

  it("shows the route's refusal in the form", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      details: { container: "popover" },
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
      container: "popover",
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
  it("says when the drag's rules found no place for an item", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    vi.mocked(agenda.ctx.drag.planPending).mockResolvedValueOnce("noRoom");
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

  it("shows a sighted user that the shown day has no room, and plans nothing", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    vi.mocked(agenda.ctx.drag.planPending).mockResolvedValueOnce("noRoom");
    query(el, '[data-agenda-pending-item="p1"]')!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(harness.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'dms.agenda.sidebar.not_planned {"title":"Client_1"}',
          color: "warning",
        }),
      ),
    );
    expect(agenda.ctx.apply).not.toHaveBeenCalled();
  });

  it("leaves a refused save to the save's own message", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      unscheduled: {},
    });
    vi.mocked(agenda.ctx.drag.planPending).mockResolvedValueOnce("refused");
    query(el, '[data-agenda-pending-item="p1"]')!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(agenda.ctx.announce).toHaveBeenCalledWith(
        'dms.agenda.sidebar.not_planned {"title":"Client_1"}',
      ),
    );
    expect(harness.toast).not.toHaveBeenCalled();
  });

  it("puts the toolbar out of reach while the sheet is open, but its button", async () => {
    const { el } = await mountBlock({ sidebar: true }, 320);
    const toggle = () => query(el, "[data-agenda-sidebar-toggle]")!;
    const today = () => query(el, "[data-agenda-today]")!;
    expect(today().closest("[inert]")).toBeNull();
    toggle().click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar]")?.dataset.agendaSidebar).toBe(
      "overlay",
    );
    expect(today().closest("[inert]")).not.toBeNull();
    expect(toggle().closest("[inert]")).toBeNull();
    toggle().click();
    await nextTick();
    expect(query(el, "[data-agenda-sidebar]")).toBeNull();
    expect(today().closest("[inert]")).toBeNull();
  });

  it("keeps the sidebar button in a strip above the views, not over them", async () => {
    const { el } = await mountBlock({ sidebar: true, toolbar: false }, 320);
    const strip = query(el, "[data-agenda-strip]")!;
    expect(strip.querySelector("[data-agenda-sidebar-toggle]")).not.toBeNull();
    expect(
      strip.querySelector("[data-agenda-sidebar-toggle]")!.className,
    ).not.toContain("absolute");
  });

  it("stacks the sidebar's sections; the pending items scroll in their own height", async () => {
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

  it("counts the legend's events with a plural form", async () => {
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
  it("leads the bar to the conflicts when only they are left", async () => {
    const { el, agenda } = await mountBlock({
      saveUrl: "/save",
      saveMode: "staged",
    });
    agenda.statuses.value = ["conflict"];
    agenda.sendable.value = 0;
    stagedListOf(agenda.ctx).value = [{ kind: "move", id: "e1" }];
    await nextTick();
    const bar = query(el, "[data-agenda-save-bar]")!;
    expect(bar.textContent).toContain(
      "dms.agenda.details.conflicts_to_resolve",
    );
    saveButton(el)!.click();
    await vi.waitFor(() => expect(harness.modalOpen).toHaveBeenCalled());
    expect(agenda.ctx.saveStaged).not.toHaveBeenCalled();
  });

  it("shows the save status without a toolbar too", async () => {
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
  it("follows the page when it moves its fill to another block", async () => {
    harness.pageFills.value = true;
    const { el } = await mountBlock({});
    const root = query(el, "[data-dms-full-agenda]")!;
    expect(root.dataset.height).toBe("fill");
    el.removeAttribute("data-dms-page-fill");
    await vi.waitFor(() => expect(root.dataset.height).toBe("44rem"));
  });
});

describe("form inputs", () => {
  it("keeps a custom datetime of the repeated DST hour, reads a zone-less one on the agenda's clock", async () => {
    const { createApp, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/entries/components/agenda/AgendaFieldInput"
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
            "onUpdate:modelValue": (value: AgendaFormValue) =>
              updates.push(value),
          }),
      });
      app.mount(el);
      return { input: el.querySelector("input")!, app };
    };
    const updates: unknown[] = [];
    const repeated = mount("2026-10-25T01:30:00Z", updates);
    expect(repeated.input.value).toBe("2026-10-25T02:30");
    type(repeated.input, "2026-10-25T02:30");
    expect(updates).toEqual(["2026-10-25T01:30:00Z"]);
    repeated.app.unmount();
    const legacy = mount("2026-10-26T09:30", []);
    expect(legacy.input.value).toBe("2026-10-26T09:30");
    legacy.app.unmount();
  });

  it('names the room picker by its field, so a screen reader does not read the select\'s default "Show popup" (fails when the resources select carries no label of its own)', async () => {
    const { createApp, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/entries/components/agenda/AgendaFieldInput"
    );
    const el = document.createElement("div");
    const app = createApp({
      render: () =>
        h(AgendaFieldInput, {
          field: {
            id: "resourceIds",
            builtIn: "resourceIds",
            kind: "select",
            label: "Rooms",
            options: [{ value: "c1", label: "Room 1" }],
            required: false,
            readOnly: false,
          },
          modelValue: [],
          timeZone: "Europe/Brussels",
        }),
    });
    app.mount(el);
    expect(el.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Rooms",
    );
    app.unmount();
  });
});
