/** @vitest-environment jsdom */
/**
 * The start and end time fields of the FullAgenda's details form: a text
 * field named in the page's language, a mistyped time kept for the
 * form to refuse and flagged on the field, Enter held back while it does not
 * read, and the field's name in sentence case.
 */
import type { AgendaFormValue } from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { useAgendaBlockHarness } from "./fixtures/agendaBlockHarness";

useAgendaBlockHarness();

/** How a test types into the time field's stand-in and leaves it. */
interface TimeFieldStub {
  typed?: (value: string) => void;
  leave?: () => void;
}

/** The time field as the page draws it. */
function fieldOf(el: HTMLElement): HTMLInputElement {
  const field = el.querySelector("input");
  if (!field) throw new Error("the time field is drawn");
  return field;
}

/** The start time field of a form holding `modelValue`, and what its text input was given. */
async function timeField(
  modelValue: string,
  builtIn: "start" | "end" = "start",
) {
  const { createApp, defineComponent, h } = await import("vue");
  const { default: AgendaFieldInput } = await import(
    "../layers/dms-ui/app/entries/components/agenda/AgendaFieldInput"
  );
  const updates: unknown[] = [];
  const input: TimeFieldStub = {};
  const el = document.createElement("div");
  const app = createApp({
    render: () =>
      h(AgendaFieldInput, {
        id: "form-start",
        field: {
          id: builtIn,
          builtIn,
          kind: "datetime",
          label: builtIn === "start" ? "Start" : "End",
          options: [],
          required: true,
          readOnly: false,
        },
        modelValue,
        timeZone: "Europe/Brussels",
        "onUpdate:modelValue": (value: AgendaFormValue) => updates.push(value),
      }),
  });
  app.component(
    "UInput",
    defineComponent({
      props: { modelValue: { type: String, default: "" } },
      emits: ["update:modelValue", "blur"],
      setup(props, { emit, attrs }) {
        input.typed = (value) => emit("update:modelValue", value);
        input.leave = () => emit("blur");
        return () => h("input", { ...attrs, value: props.modelValue });
      },
    }),
  );
  app.mount(el);
  await nextTick();
  /** Presses Enter in the time field, and whether the press was kept from submitting the form. */
  const enter = () => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    el.querySelector("input")?.dispatchEvent(event);
    return event.defaultPrevented;
  };
  apps.push(app);
  return { el, input, updates, enter };
}

const apps: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
});

describe("the details form's time fields", () => {
  it("edits the start time in a text field named in the page's language, never a native time input that Chrome names in the browser's language nor a Reka field named in English (fails when a Dutch page reads 'Heures / Minutes' or 'hour, minute')", async () => {
    const { createApp, defineComponent, h } = await import("vue");
    const { default: AgendaFieldInput } = await import(
      "../layers/dms-ui/app/entries/components/agenda/AgendaFieldInput"
    );
    const updates: unknown[] = [];
    let typed: ((value: string) => void) | undefined;
    let leave: (() => void) | undefined;
    let shown: unknown;
    let label: unknown;
    const el = document.createElement("div");
    const app = createApp({
      render: () =>
        h(AgendaFieldInput, {
          field: {
            id: "start",
            builtIn: "start",
            kind: "datetime",
            label: "Start",
            options: [],
            required: false,
            readOnly: false,
          },
          modelValue: "2026-11-12T14:00",
          timeZone: "Europe/Brussels",
          "onUpdate:modelValue": (value: AgendaFormValue) =>
            updates.push(value),
        }),
    });
    app.component(
      "UInput",
      defineComponent({
        props: { modelValue: { type: String, default: "" } },
        emits: ["update:modelValue", "blur"],
        setup(props, { emit, attrs }) {
          typed = (value) => emit("update:modelValue", value);
          leave = () => emit("blur");
          return () => {
            shown = props.modelValue;
            label = attrs["aria-label"];
            return h("span");
          };
        },
      }),
    );
    app.mount(el);

    expect(el.querySelector('input[type="time"]')).toBeNull();
    expect([shown, label]).toEqual(["14:00", "dms.agenda.form.start_time"]);
    typed?.("9h05");
    leave?.();
    expect(updates).toEqual(["2026-11-12T09:05"]);
    app.unmount();
  });
  it("C keeps a mistyped time in the form for the form to refuse, never the time it had (fails when '25:00' is dropped and the old time saved as if typed)", async () => {
    for (const typed of ["25:00", "9h", "abc"]) {
      const { input, updates } = await timeField("2026-11-12T14:00");
      input.typed?.(typed);
      input.leave?.();
      expect(updates).toEqual([`2026-11-12T${typed}`]);
    }
  });
  it("C flags a time that is not a time of day on its field, with aria-invalid and a message it is described by, and Enter does not submit (fails when the field looks valid or Enter closes the drawer)", async () => {
    const { el, enter } = await timeField("2026-11-12T25:00");

    const message = el.querySelector('[role="alert"]');
    expect(fieldOf(el).value).toBe("25:00");
    expect(fieldOf(el).getAttribute("aria-invalid")).toBe("true");
    expect(message?.textContent?.trim()).toBe("dms.agenda.form.invalid_time");
    expect(fieldOf(el).getAttribute("aria-describedby")).toBe(message?.id);
    expect(enter()).toBe(true);
  });
  it("1 an emptied time is flagged on its field with the time-required message, never put back (fails when the field shows the kept time while the screen is empty)", async () => {
    const { input, updates } = await timeField("2026-11-12T10:00");
    input.typed?.("");
    input.leave?.();
    expect(updates).toEqual(["2026-11-12T"]);

    const { el: emptiedEl, enter } = await timeField("2026-11-12T");
    const message = emptiedEl.querySelector('[role="alert"]');
    expect(fieldOf(emptiedEl).value).toBe("");
    expect(fieldOf(emptiedEl).getAttribute("aria-invalid")).toBe("true");
    expect(message?.textContent?.trim()).toBe("dms.agenda.form.time_required");
    expect(fieldOf(emptiedEl).getAttribute("aria-describedby")).toBe(
      message?.id,
    );
    expect(enter()).toBe(true);
  });
});

describe("Enter and the end time's name in the details form", () => {
  it("1 Enter on a field the member just emptied does not submit (fails when Enter commits the kept time)", async () => {
    const { input, updates, enter } = await timeField("2026-11-12T10:00");
    input.typed?.("");
    expect(enter()).toBe(true);
    expect(updates).toEqual(["2026-11-12T"]);
  });
  it("C lets Enter submit a time that reads (fails when Enter is blocked on a valid time)", async () => {
    const { el, enter } = await timeField("2026-11-12T14:00");

    expect(fieldOf(el).hasAttribute("aria-invalid")).toBe(false);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(enter()).toBe(false);
  });
  it("G names the end time in sentence case through its own key (fails when the label is composed as 'Time of End')", async () => {
    const { el } = await timeField("2026-11-12T14:00", "end");

    expect(fieldOf(el).getAttribute("aria-label")).toBe(
      "dms.agenda.form.end_time",
    );
  });
  it("reads a time typed the ways people type it, and refuses what is not a time of day (fails when '9h45' or '0945' is lost, or '25:00' is kept, or minutes are guessed from '9h' or '9.5')", async () => {
    const { readClock } = await import(
      "../layers/dms-ui/app/entries/composables/agenda/agendaFormTime"
    );
    expect(
      [
        "9:45",
        "09:45",
        "9h45",
        "9.45",
        "0945",
        "9",
        " 18:00 ",
        "25:00",
        "9:75",
        "abc",
        "9h",
        "9.5",
        "9h5",
      ].map(readClock),
    ).toEqual([
      "09:45",
      "09:45",
      "09:45",
      "09:45",
      "09:45",
      "09:00",
      "18:00",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
