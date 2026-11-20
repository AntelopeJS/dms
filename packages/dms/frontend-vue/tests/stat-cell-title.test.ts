/** @vitest-environment jsdom */
/**
 * A KPI card shows its whole title: a title longer than the card wraps onto
 * another line instead of ending in an ellipsis.
 */
import { computed, createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StatCell from "../layers/dms-ui/app/entries/components/stat/StatCell";

const TITLE = "Chiffre d'affaires encaissé sur la période";

let app: App | undefined;

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it.each([{ stack: false }, { stack: true }])(
  "lets the title wrap at every width (%o)",
  ({ stack }) => {
    app = createApp({
      render: () => h(StatCell, { eyebrow: TITLE, value: 42, stack }),
    });
    app.component("USkeleton", defineComponent({ render: () => null }));
    const host = document.createElement("div");
    app.mount(host);
    const title = [...host.querySelectorAll("p")].find(
      (node) => node.textContent === TITLE,
    );
    expect(title).toBeDefined();
    expect(title?.className).not.toMatch(/\b(truncate|whitespace-nowrap)\b/);
  },
);
