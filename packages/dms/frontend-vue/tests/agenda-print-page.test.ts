/** @vitest-environment jsdom */
import { createApp, defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { useAgendaPrintPage } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaPrintPage";

const sheet = () => document.getElementById("dms-agenda-print-page");

describe("the printed page of the agenda", () => {
  it("is A4 landscape only while an agenda is mounted (fails when the @page rule stays in the app after the agenda is left)", () => {
    const app = createApp(
      defineComponent({
        setup() {
          useAgendaPrintPage();
          return () => h("div");
        },
      }),
    );
    expect(sheet()).toBeNull();

    app.mount(document.createElement("div"));
    expect(sheet()?.textContent).toContain("A4 landscape");

    app.unmount();
    expect(sheet()).toBeNull();
  });
});
