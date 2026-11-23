/**
 * Editing a cell of a repeater checks the row it belongs to, not the rows
 * nobody touched: a form opening with three empty-description rows flags
 * row 2 once its unit changes, and row 3 once its own does, never row 1.
 * A submit still checks every row.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import type { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import Form from "@nuxt/ui/components/Form.vue";
import FormField from "@nuxt/ui/components/FormField.vue";
import Repeater from "../layers/dms-ui/app/components/form/components/InputRepeater.vue";
import { registerDmsComponent } from "#dms/frontend-module";
import { host, mountForm } from "./helpers/form-runtime";
import { defined } from "./helpers/defined";

const Cell = defineComponent({
  props: { modelValue: { type: String, default: undefined } },
  emits: ["update:modelValue"],
  setup:
    (props, { emit, attrs }) =>
    () =>
      h("input", {
        id: attrs.id,
        value: props.modelValue ?? "",
        onInput: (event: Event) => {
          if (event.target instanceof HTMLInputElement)
            emit("update:modelValue", event.target.value);
        },
      }),
});
registerDmsComponent("dms-test-row-cell", Cell);

const LINES = {
  id: "lines",
  label: "Lines",
  type: "array",
  defaultValue: [{ unit: "hour" }, { unit: "hour" }, { unit: "hour" }],
  component: {
    componentName: "dms-input-repeater",
    options: {
      columns: [
        {
          id: "description",
          required: true,
          component: { componentName: "dms-test-row-cell" },
        },
        { id: "unit", component: { componentName: "dms-test-row-cell" } },
      ],
    },
  },
};

const SCHEMA: z.core.JSONSchema.BaseSchema = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string", minLength: 1 },
          unit: { type: "string" },
        },
        required: ["description"],
      },
    },
  },
};

beforeEach(() => {
  vi.stubGlobal("resolveDmsComponent", (name: string) =>
    name === "dms-input-repeater" ? Repeater : undefined,
  );
});

async function settle() {
  for (let tick = 0; tick < 6; tick++) {
    await new Promise((resolve) => setTimeout(resolve));
    await nextTick();
  }
}

async function openLines() {
  await mountForm({ fields: [LINES], schema: SCHEMA }, undefined, (app) => {
    app.component("UForm", Form);
    app.component("UFormField", FormField);
  });
  await settle();
}

async function type(row: number, column: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `#lines\\.${row}\\.${column}`,
  );
  expect(input, `cell ${row}.${column}`).not.toBeNull();
  defined(input).value = value;
  defined(input).dispatchEvent(new Event("input"));
  await settle();
}

/** The rows whose cells show an error. */
function flaggedRows(): number[] {
  return [0, 1, 2].filter((row) =>
    host.querySelector(`[id^="lines.${row}."][aria-invalid="true"]`),
  );
}

async function submit() {
  defined(host.querySelector("form")).dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
  await settle();
}

describe("a repeater's validation", () => {
  it("flags only the rows whose cells were edited", async () => {
    await openLines();
    expect(flaggedRows()).toEqual([]);
    await type(1, "unit", "day");
    expect(flaggedRows()).toEqual([1]);
    await type(2, "unit", "day");
    expect(flaggedRows()).toEqual([1, 2]);
  });

  it("clears an edited row once it is valid", async () => {
    await openLines();
    await type(1, "unit", "day");
    await type(1, "description", "Design");
    expect(flaggedRows()).toEqual([]);
  });

  it("flags every invalid row on submit", async () => {
    await openLines();
    await type(1, "description", "Design");
    await submit();
    expect(flaggedRows()).toEqual([0, 2]);
  });
});
