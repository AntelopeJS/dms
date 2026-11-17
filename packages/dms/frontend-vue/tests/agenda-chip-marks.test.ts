/** @vitest-environment jsdom */
/**
 * What a reader takes in from a tile at a glance: the status mark
 * on every tile length, the pinned "overbooked" state on every tile length, a
 * status named once, and the hover bubble's status line at readable contrast.
 */
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { occurrence } from "./fixtures/agendaOccurrences";
import {
  contextFor,
  mount,
  mounted,
  translate,
} from "./fixtures/agendaGridMount";
import AgendaEventChip from "../layers/dms-ui/app/entries/components/agenda/AgendaEventChip";
import AgendaChipTooltip from "../layers/dms-ui/app/entries/components/agenda/AgendaChipTooltip";
import { MARK_DISC_CLASSES } from "../layers/dms-ui/app/entries/composables/agenda/agendaChip";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: translate, locale: ref("en-GB") }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  mounted.ctx = null;
});

const TILE_HEIGHT = { "15": 24, "30": 48, "45": 72, "60": 96 } as const;
const END = { "15": "09:15", "30": "09:30", "45": "09:45", "60": "10:00" };

const booked = (minutes: keyof typeof END, extra: Partial<AgendaEvent> = {}) =>
  occurrence("a", "2026-10-26T09:00", `2026-10-26T${END[minutes]}`, {
    mark: { label: "Arrived", icon: "i-ph-sign-in", tone: "info" },
    ...extra,
  });

describe("the status mark on every tile length", () => {
  it.each(["15", "30", "45", "60"] as const)(
    "Q7 draws the status mark on a %s-minute tile, even with no room for a second line (fails when a tile too short for a time line loses its mark)",
    async (minutes) => {
      contextFor({});
      const root = await mount(AgendaEventChip, {
        occurrence: booked(minutes),
        height: TILE_HEIGHT[minutes],
      });

      expect(root.querySelectorAll("[data-agenda-status-mark]")).toHaveLength(
        1,
      );
    },
  );

  it("gives the 15-minute tile its mark on the title line, before the name (fails when the mark moves under the title where a short tile cuts it)", async () => {
    contextFor({});
    const root = await mount(AgendaEventChip, {
      occurrence: booked("15"),
      height: TILE_HEIGHT["15"],
    });
    const line = root.querySelector(
      "[data-agenda-status-mark]",
    )!.parentElement!;

    expect(line.textContent).toContain("Event a");
    expect(line.firstElementChild).toBe(
      root.querySelector("[data-agenda-status-mark]"),
    );
  });
});

describe("a pinned state on every tile length", () => {
  const overbooked = {
    label: "Overbooked",
    tone: "warning" as const,
    icon: "i-ph-stack",
    pinned: true,
  };

  it.each(["15", "30", "45", "60"] as const)(
    "Q8 draws the overbooked state as an icon on a %s-minute tile (fails when the state lives only in the badge row that short tiles drop)",
    async (minutes) => {
      contextFor({});
      const root = await mount(AgendaEventChip, {
        occurrence: booked(minutes, { badges: [overbooked] }),
        height: TILE_HEIGHT[minutes],
      });

      expect(root.querySelectorAll("[data-agenda-pinned-mark]")).toHaveLength(
        1,
      );
    },
  );

  it("names the overbooked state in the accessible name, once, and draws no icon for a plain badge (fails when the state is silent for a screen reader, or every badge becomes an icon)", async () => {
    contextFor({});
    const plain = { label: "Latex", tone: "warning" as const };
    const root = await mount(AgendaEventChip, {
      occurrence: booked("30", { badges: [overbooked, plain] }),
      height: TILE_HEIGHT["30"],
    });
    const name = root.querySelector("button")!.getAttribute("aria-label")!;

    expect(name.match(/Overbooked/g)).toHaveLength(1);
    expect(name).not.toContain("Latex");
    expect(root.querySelectorAll("[data-agenda-pinned-mark]")).toHaveLength(1);
  });

  it("says the overbooked state in the hover bubble (fails when the bubble leaves it to the drawer)", async () => {
    contextFor({});
    const root = await mount(AgendaChipTooltip, {
      occurrence: booked("30", { badges: [overbooked] }),
      mark: { icon: "i-ph-sign-in", tone: "info", label: "Arrived" },
      pinned: ["Overbooked"],
      when: "09:00",
      calendar: "",
      description: "",
    });

    expect(
      root.querySelector("[data-agenda-tooltip-pinned]")!.textContent,
    ).toContain("Overbooked");
  });
});

describe("a status named once in a tile's accessible name", () => {
  it("does not repeat Absent after the mark that already says it (fails when the event's status label is added after its mark)", async () => {
    contextFor({});
    const root = await mount(AgendaEventChip, {
      occurrence: booked("30", {
        mark: { label: "Absent", icon: "i-ph-user-minus", tone: "error" },
        status: "cancelled",
        statusLabel: "Absent",
      }),
      height: TILE_HEIGHT["30"],
    });
    const name = root.querySelector("button")!.getAttribute("aria-label")!;

    expect(name.match(/Absent/g)).toHaveLength(1);
    expect(name).not.toContain("dms.agenda.grid.cancelled");
  });
});

describe("the status line of the hover bubble", () => {
  it.each([
    "info",
    "secondary",
    "success",
    "warning",
    "error",
    "neutral",
  ] as const)(
    "Q10 sets a %s status on the pill of its tone, with the inverted text of its disc (fails when the line is the tone's own colour on the bubble's inverted background, about 2 to 3:1)",
    async (tone) => {
      contextFor({});
      const root = await mount(AgendaChipTooltip, {
        occurrence: booked("30"),
        mark: { icon: "i-ph-sign-in", tone, label: "Arrived" },
        pinned: [],
        when: "09:00",
        calendar: "",
        description: "",
      });
      const line = root.querySelector("[data-agenda-tooltip-status]")!;

      expect(line.className).toContain(MARK_DISC_CLASSES[tone]);
      expect(line.className).toContain("text-inverted");
      expect(line.className).not.toMatch(
        /(^|\s)text-(success|error|warning|info|primary)(\s|$)/,
      );
    },
  );

  it("keeps Arrived and In the room on different pill colours (fails when both are the teal of primary and info)", () => {
    expect(MARK_DISC_CLASSES.info).not.toBe(MARK_DISC_CLASSES.secondary);
    expect(MARK_DISC_CLASSES.secondary).toContain("secondary");
    expect(MARK_DISC_CLASSES.secondary).toContain("dark:");
  });
});
