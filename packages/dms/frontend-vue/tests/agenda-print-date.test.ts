/** @vitest-environment jsdom */
import { computed } from "vue";
import { describe, expect, it } from "vitest";
import {
  mountBlock as mountWith,
  query,
  useAgendaBlockHarness,
} from "./fixtures/agendaBlockHarness";
import AgendaFrame from "../layers/dms-ui/app/entries/components/agenda/AgendaFrame";
import { formatAgendaDay } from "../layers/dms-ui/app/entries/composables/agenda/agendaFormat";
import type { AgendaContext } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";

useAgendaBlockHarness();

const oneDay = (day: string): Partial<AgendaContext> => ({
  range: computed(() => ({ from: day, to: day, days: [], start: 0, end: 0 })),
});

describe("the printed day sheet of the agenda", () => {
  it("names a one-day range by its full date (fails when the date line is removed or emptied)", async () => {
    const { el } = await mountWith(AgendaFrame, {}, 1400, {
      context: (ctx) => ({
        ...oneDay("2027-04-12"),
        format: {
          ...ctx.format,
          day: (key, style) => formatAgendaDay(key, style, "en-GB"),
        },
      }),
    });
    expect(query(el, "[data-agenda-print-date]")?.textContent?.trim()).toMatch(
      /^Monday,? 12 April 2027$/,
    );
  });

  it("keeps the toolbar's period for a range of days (fails when the sheet always prints one day)", async () => {
    const { el } = await mountWith(AgendaFrame);
    expect(query(el, "[data-agenda-print-date]")?.textContent?.trim()).toBe(
      "26 Oct – 1 Nov 2026",
    );
  });
});
