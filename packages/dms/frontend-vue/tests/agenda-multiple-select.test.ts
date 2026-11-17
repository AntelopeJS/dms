/** @vitest-environment jsdom */
/**
 * A `select` field of the FullAgenda's details form marked `multiple`: the
 * weekdays of a working-hours block, so a Monday-to-Friday week is one block.
 */
import type { AgendaFormValue } from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import { describe, expect, it } from "vitest";
import { useAgendaBlockHarness } from "./fixtures/agendaBlockHarness";

useAgendaBlockHarness();

describe("a multiple select field of the details form", () => {
  it("draws a select marked multiple as a multiple select of its options and answers the list picked (fails when it draws a single select)", async () => {
    const { createApp, defineComponent, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/entries/components/agenda/AgendaFieldInput"
    );
    const updates: unknown[] = [];
    let seen: { multiple: unknown; items: unknown } | undefined;
    let pick: ((value: string[]) => void) | undefined;
    const app = createApp({
      render: () =>
        h(AgendaFieldInput, {
          field: {
            id: "weekdays",
            kind: "select",
            label: "Days",
            multiple: true,
            options: [
              { value: "1", label: "Monday" },
              { value: "2", label: "Tuesday" },
            ],
            required: false,
            readOnly: false,
          },
          modelValue: ["1"],
          "onUpdate:modelValue": (value: AgendaFormValue) =>
            updates.push(value),
        }),
    });
    app.component(
      "USelectMenu",
      defineComponent({
        props: {
          multiple: { type: Boolean, default: false },
          items: { type: Array, default: () => [] },
        },
        emits: ["update:modelValue"],
        setup(props, { emit }) {
          seen = { multiple: props.multiple, items: props.items };
          pick = (value) => emit("update:modelValue", value);
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    pick?.(["1", "2"]);

    expect(seen?.multiple).toBe(true);
    expect(seen?.items).toEqual([
      { label: "Monday", value: "1", icon: undefined },
      { label: "Tuesday", value: "2", icon: undefined },
    ]);
    expect(updates).toEqual([["1", "2"]]);
    app.unmount();
  });
});
